// Copyright 2024 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
'use strict'

import { crypto, Psbt } from 'bitcoinjs-lib'
import BigNumber from 'bignumber.js'

const DUST_LIMIT = 546

/**
 * @typedef {Object} KeyPair
 * @property {string} publicKey - The public key.
 * @property {string} privateKey - The private key.
 */

/**
 * @typedef {Object} BtcTransaction
 * @property {string} to - The transaction's recipient.
 * @property {number} value - The amount of bitcoins to send to the recipient (in satoshis).
 */

export default class WalletAccountBtc {
  #path
  #index
  #address
  #keyPair

  #electrumClient
  #bip32

  constructor (config) {
    this.#path = config.path
    this.#index = config.index
    this.#address = config.address
    this.#keyPair = config.keyPair

    this.#electrumClient = config.electrumClient

    this.#bip32 = config.bip32
  }

  /**
   * The derivation path of this account (see [BIP-84](https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki)).
   *
   * @type {number}
   */
  get path () {
    return this.#path
  }

  /**
   * The derivation path's index of this account.
   *
   * @type {number}
   */
  get index () {
    return this.#index
  }

  /**
   * The account's key pair.
   *
   * @type {KeyPair}
   */
  get keyPair () {
    return this.#keyPair
  }

  /**
   * Returns the account's address.
   *
   * @returns {Promise<string>} The account's address.
   */
  async getAddress () {
    return this.#address
  }

  /**
   * Signs a message.
   *
   * @param {string} message - The message to sign.
   * @returns {Promise<string>} The message's signature.
   */
  async sign (message) {
    const messageHash = crypto.sha256(Buffer.from(message))

    return this.#bip32.sign(messageHash).toString('base64')
  }

  /**
   * Verifies a message's signature.
   *
   * @param {string} message - The original message.
   * @param {string} signature - The signature to verify.
   * @returns {Promise<boolean>} True if the signature is valid.
   */
  async verify (message, signature) {
    try {
      const messageHash = crypto.sha256(Buffer.from(message))
      const signatureBuffer = Buffer.from(signature, 'base64')
      const result = this.#bip32.verify(messageHash, signatureBuffer)

      return result
    } catch (_) {
      return false
    }
  }

  /**
   * Sends a transaction with arbitrary data.
   *
   * @param {BtcTransaction} tx - The transaction to send.
   * @returns {Promise<string>} The transaction's hash.
   */
  async sendTransaction ({ to, value }) {
    const tx = await this.#createTransaction({ recipient: to, amount: value })
    try {
      await this.#broadcastTransaction(tx.hex)
    } catch (err) {
      console.log(err)
      throw new Error('failed to broadcast tx')
    }
    return tx.txid
  }

  async #createTransaction ({ recipient, amount }) {
    let feeRate
    try {
      const feeEstimate = await this.#electrumClient.getFeeEstimate(1)
      feeRate = new BigNumber(feeEstimate).multipliedBy(100000)
    } catch (err) {
      console.error('Electrum client error:', err)
      throw new Error('Failed to estimate fee: ' + err.message)
    }

    const addr = await this.getAddress()
    const utxoSet = await this.#collectUtxos(amount, addr)
    return await this.#generateRawTx(
      utxoSet,
      amount,
      recipient,
      feeRate
    )
  }

  async #collectUtxos (amount, address) {
    let unspent
    try {
      unspent = await this.#electrumClient.getUnspent(address)
    } catch (err) {
      console.error('Electrum client error:', err)
      throw new Error('Failed to fetch UTXOs: ' + err.message)
    }

    if (!unspent || unspent.length === 0) {
      throw new Error('No unspent outputs available')
    }

    const collected = []
    let totalCollected = new BigNumber(0)

    for (const utxo of unspent) {
      try {
        const tx = await this.#electrumClient.getTransaction(utxo.tx_hash)
        const vout = tx.vout[utxo.tx_pos]
        collected.push({
          ...utxo,
          vout
        })
        totalCollected = totalCollected.plus(utxo.value)

        if (totalCollected.isGreaterThanOrEqualTo(amount)) {
          break
        }
      } catch (err) {
        console.error('Electrum client error:', err)
        throw new Error('Failed to fetch transaction: ' + err.message)
      }
    }

    return collected
  }

  async #generateRawTx (utxoSet, sendAmount, recipient, feeRate) {
    if (+sendAmount <= DUST_LIMIT) {
      throw new Error(
        'send amount must be bigger than dust limit ' +
          DUST_LIMIT +
          ' got: ' +
          sendAmount
      )
    }

    let totalInput = new BigNumber(0)
    for (const utxo of utxoSet) {
      totalInput = totalInput.plus(utxo.value)
    }

    const createPsbt = async (fee) => {
      const psbt = new Psbt({ network: this.#electrumClient.network })

      utxoSet.forEach((utxo, index) => {
        psbt.addInput({
          hash: utxo.tx_hash,
          index: utxo.tx_pos,
          witnessUtxo: {
            script: Buffer.from(utxo.vout.scriptPubKey.hex, 'hex'),
            value: utxo.value
          },
          bip32Derivation: [
            {
              masterFingerprint: this.#bip32.fingerprint,
              path: this.path,
              pubkey: Buffer.from(this.keyPair.publicKey, 'hex')
            }
          ]
        })
      })

      psbt.addOutput({
        address: recipient,
        value: sendAmount
      })

      const change = totalInput.minus(sendAmount).minus(fee)
      const addr = await this.getAddress()
      if (change.isGreaterThan(DUST_LIMIT)) {
        psbt.addOutput({
          address: addr,
          value: change.toNumber()
        })
      } else if (change.isLessThan(0)) {
        throw new Error('Insufficient balance.')
      }

      utxoSet.forEach((utxo, index) => {
        psbt.signInputHD(index, this.#bip32)
      })

      psbt.finalizeAllInputs()
      return psbt
    }

    let psbt = await createPsbt(0)
    const dummyTx = psbt.extractTransaction()
    let estimatedFee = new BigNumber(feeRate)
      .multipliedBy(dummyTx.virtualSize())
      .integerValue(BigNumber.ROUND_CEIL)

    const minRelayFee = new BigNumber(141)
    estimatedFee = BigNumber.max(estimatedFee, minRelayFee)

    psbt = await createPsbt(estimatedFee)
    const tx = psbt.extractTransaction()
    const txHex = tx.toHex()
    const txId = tx.getId()
    return {
      txid: txId,
      hex: txHex
    }
  }

  #satsToBtc (sats) {
    const SATOSHIS_PER_BTC = new BigNumber('100000000')
    return new BigNumber(sats).dividedBy(SATOSHIS_PER_BTC).toFixed(8)
  }

  async getBalance () {
    const addr = await this.getAddress()
    const res = await this.#electrumClient.getBalance(addr)
    const btc = this.#satsToBtc(res.confirmed)
    return +btc
  }

  async #broadcastTransaction (txHex) {
    try {
      return await this.#electrumClient.broadcastTransaction(txHex)
    } catch (err) {
      console.error('Electrum broadcast error:', err)
      throw new Error('Failed to broadcast transaction: ' + err.message)
    }
  }
}
