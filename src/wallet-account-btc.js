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

import { crypto, payments, Psbt } from 'bitcoinjs-lib'
import { validateMnemonic, mnemonicToSeedSync } from 'bip39'
import { BIP32Factory } from 'bip32'

import ecc from '@bitcoinerlab/secp256k1'

import BigNumber from 'bignumber.js'

import ElectrumClient from './electrum-client.js'

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

/**
 * @typedef {Object} BtcTransfer
 * @property {string} txid - The transaction's id.
 * @property {string} address - The user's own address.
 * @property {number} vout - The index of the output in the transaction.
 * @property {number} height - The block height (if unconfirmed, 0).
 * @property {number} value - The value of the transfer (in bitcoin).
 * @property {"incoming" | "outgoing"} direction - The direction of the transfer.
 * @property {number} [fee] - The fee paid for the full transaction (in bitcoin).
 * @property {string} [recipient] - The receiving address for outgoing transfers.
 */

/**
 * @typedef {Object} BtcWalletConfig
 * @property {string} [host] - The electrum server's hostname (default: "electrum.blockstream.info").
 * @property {number} [port] - The electrum server's port (default: 50001).
 * @property {string} [network] - The name of the network to use; available values: "bitcoin", "regtest", "testnet" (default: "bitcoin").
 */

const bip32 = BIP32Factory(ecc)

const BIP_84_BTC_DERIVATION_PATH_PREFIX = "m/84'/0'"

export default class WalletAccountBtc {
  #electrumClient
  #bip32

  #path
  #address
  #keyPair

  /**
   * Creates a new bitcoin wallet account.
   *
   * @param {string} seedPhrase - The bip-39 mnemonic.
   * @param {string} path - The BIP-84 derivation path (e.g. "0'/0/0").
   * @param {BtcWalletConfig} [config] - The configuration object.
   */
  constructor (seedPhrase, path, config) {
    if (!validateMnemonic(seedPhrase)) {
      throw new Error('The seed phrase is invalid.')
    }

    this.#electrumClient = new ElectrumClient(config)

    this.#bip32 = WalletAccountBtc.#seedPhraseToBip32(seedPhrase)

    this.#initialize(path)
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
    return +this.#path.split('/').pop()
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
    const messageHash = crypto.sha256(Buffer.from(message))
    const signatureBuffer = Buffer.from(signature, 'base64')
    const result = this.#bip32.verify(messageHash, signatureBuffer)

    return result
  }

  /**
   * Sends a transaction with arbitrary data.
   *
   * @param {BtcTransaction} tx - The transaction to send.
   * @returns {Promise<string>} The transaction's hash.
   */
  async sendTransaction ({ to, value }) {
    const tx = await this.#getTransaction({ recipient: to, amount: value })

    await this.#broadcastTransaction(tx.hex)

    return tx.txid
  }

  /**
   * Quotes a transaction.
   *
   * @param {BtcTransaction} tx - The transaction to quote.
   * @returns {Promise<number>} The transaction's fee (in satoshis).
   */
  async quoteTransaction ({ to, value }) {
    const tx = await this.#getTransaction({ recipient: to, amount: value })

    return +tx.fee
  }

  /**
   * Returns the account's bitcoin balance.
   *
   * @returns {Promise<number>} The bitcoin balance (in satoshis).
   */
  async getBalance () {
    const address = await this.getAddress()

    const { confirmed } = await this.#electrumClient.getBalance(address)

    return +confirmed
  }

  /**
   * Returns the balance of the account for a specific token.
   *
   * @param {string} tokenAddress - The smart contract address of the token.
   * @returns {Promise<number>} The token balance.
   */
  async getTokenBalance (tokenAddress) {
    throw new Error('Method not supported on the bitcoin blockchain.')
  }

  /**
  * Returns the bitcoin transfers history of the account.
  *
   * @param {Object} [options] - The options.
   * @param {"incoming" | "outgoing" | "all"} [options.direction] - If set, only returns transfers with the given direction (default: "all").
   * @param {number} [options.limit] - The number of transfers to return (default: 10).
   * @param {number} [options.skip] - The number of transfers to skip (default: 0).
   * @returns {Promise<BtcTransfer[]>} The bitcoin transfers.
  */
  async getTransfers (options = {}) {
    const { direction = 'all', limit = 10, skip = 0 } = options

    const address = await this.getAddress()

    const history = await this.#electrumClient.getHistory(address)

    const isAddressMatch = (scriptPubKey, addr) => {
      if (!scriptPubKey) return false
      if (scriptPubKey.address) return scriptPubKey.address === addr
      if (Array.isArray(scriptPubKey.addresses)) return scriptPubKey.addresses.includes(addr)
      return false
    }

    const extractAddress = (scriptPubKey) => {
      if (!scriptPubKey) return null
      if (scriptPubKey.address) return scriptPubKey.address
      if (Array.isArray(scriptPubKey.addresses)) return scriptPubKey.addresses[0]
      return null
    }

    const getInputValue = async (vinList) => {
      let total = 0
      for (const vin of vinList) {
        try {
          const prevTx = await this.#electrumClient.getTransaction(vin.txid)
          const prevVout = prevTx.vout[vin.vout]
          total += prevVout.value
        } catch (_) {}
      }
      return total
    }

    const isOutgoingTx = async (vinList) => {
      for (const vin of vinList) {
        try {
          const prevTx = await this.#electrumClient.getTransaction(vin.txid)
          const prevVout = prevTx.vout[vin.vout]
          if (isAddressMatch(prevVout.scriptPubKey, address)) return true
        } catch (_) {}
      }
      return false
    }

    const transfers = []

    for (const item of history.slice(skip)) {
      if (transfers.length >= limit) break

      const tx = await this.#electrumClient.getTransaction(item.tx_hash)
      const totalInput = await getInputValue(tx.vin)
      const totalOutput = tx.vout.reduce((sum, vout) => sum + vout.value, 0)
      const fee = totalInput > 0 ? +(totalInput - totalOutput).toFixed(8) : null
      const isOutgoing = await isOutgoingTx(tx.vin)

      for (const [index, vout] of tx.vout.entries()) {
        const recipient = extractAddress(vout.scriptPubKey)
        const isToSelf = isAddressMatch(vout.scriptPubKey, address)

        let directionType = null
        if (isToSelf && !isOutgoing) directionType = 'incoming'
        else if (!isToSelf && isOutgoing) directionType = 'outgoing'
        else if (isToSelf && isOutgoing) directionType = 'change'
        else continue

        if (directionType === 'change') continue
        if (direction !== 'all' && direction !== directionType) continue
        if (transfers.length >= limit) break

        const transfer = {
          txid: item.tx_hash,
          height: item.height,
          value: vout.value,
          vout: index,
          direction: directionType,
          recipient,
          fee,
          address
        }

        transfers.push(transfer)
      }
    }

    return transfers
  }

  #initialize (path) {
    const wallet = this.#bip32.derivePath(path)

    this.#path = `${BIP_84_BTC_DERIVATION_PATH_PREFIX}/${path}`

    this.#address = payments.p2wpkh({
      pubkey: wallet.publicKey,
      network: this.#electrumClient.network
    })
      .address

    this.#keyPair = {
      publicKey: wallet.publicKey.toString('hex'),
      privateKey: wallet.toWIF()
    }
  }

  async #getTransaction ({ recipient, amount }) {
    const address = await this.getAddress()
    const utxoSet = await this.#getUtxos(amount, address)
    const feeEstimate = await this.#electrumClient.getFeeEstimate()

    const feeRate = new BigNumber(feeEstimate).multipliedBy(100_000)

    return await this.#getRawTransaction(utxoSet, amount, recipient, feeRate)
  }

  async #getUtxos (amount, address) {
    const unspent = await this.#electrumClient.getUnspent(address)

    if (!unspent || unspent.length === 0) {
      throw new Error('No unspent outputs available.')
    }

    const collected = []
    let totalCollected = new BigNumber(0)

    for (const utxo of unspent) {
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
    }

    return collected
  }

  async #getRawTransaction (utxoSet, amount, recipient, feeRate) {
    if (+amount <= DUST_LIMIT) {
      throw new Error(`The amount must be bigger than the dust limit (= ${DUST_LIMIT}).`)
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
        value: amount
      })

      const change = totalInput.minus(amount).minus(fee)
      const addr = await this.getAddress()
      if (change.isGreaterThan(DUST_LIMIT)) {
        psbt.addOutput({
          address: addr,
          value: change.toNumber()
        })
      } else if (change.isLessThan(0)) {
        throw new Error('Insufficient balance to send the transaction.')
      }

      utxoSet.forEach((_, index) => {
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
      hex: txHex,
      fee: estimatedFee
    }
  }

  async #broadcastTransaction (txHex) {
    return await this.#electrumClient.broadcastTransaction(txHex)
  }

  static #seedPhraseToBip32 (seedPhrase) {
    const seed = mnemonicToSeedSync(seedPhrase)
    const root = bip32.fromSeed(seed)
    return root
  }
}
