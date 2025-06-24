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
import { BIP32Factory } from 'bip32'
import sodium from 'sodium-universal'
import ecc from '@bitcoinerlab/secp256k1'
import * as tools from 'uint8array-tools'
import { hmac } from '@noble/hashes/hmac'
import { sha512 } from '@noble/hashes/sha512'
import BigNumber from 'bignumber.js'
import ElectrumClient from './electrum-client.js'

/**
 * @typedef {import('@wdk/wallet').KeyPair} KeyPair
 * @typedef {import('@wdk/wallet').IWalletAccount} IWalletAccount
 */

/**
 * @typedef {Object} BtcTransaction
 * @property {string} to - The transaction's recipient.
 * @property {number} value - The amount of bitcoins to send to the recipient (in satoshis).
 */

/**
 * @typedef {Object} BtcTransactionResult
 * @property {string} hash - The transaction's hash.
 * @property {number} fee - The gas cost (in satoshis).
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

const DUST_LIMIT = 546
const bip32 = BIP32Factory(ecc)
const BIP_84_BTC_DERIVATION_PATH_PREFIX = "m/84'/0'"

const BITCOIN = {
  messagePrefix: '\x18Bitcoin Signed Message:\n',
  bech32: 'bc',
  bip32: { public: 0x0488b21e, private: 0x0488ade4 },
  pubKeyHash: 0x00,
  scriptHash: 0x05,
  wif: 0x80
}

/**
 * Error thrown when a method or operation isn't supported
 * @extends Error
 */
export class UnsupportedOperationError extends Error {
  /**
   * @param {string} methodName  - Name of the method invoked.
   */
  constructor (methodName) {
    super(`${methodName} is not supported on the Bitcoin blockchain.`)
    this.name = 'UnsupportedOperationError'
  }
}

/** @implements {IWalletAccount} */
export default class WalletAccountBtc {
  /**
   * Creates a new bitcoin wallet account.
   *
   * @param {Uint8Array} seedBuffer - Uint8Array seed buffer.
   * @param {string} path - The BIP-84 derivation path (e.g. "0'/0/0").
   * @param {BtcWalletConfig} [config] - The configuration object.
   */
  constructor (seedBuffer, path, config) {
    /** @private @type {ElectrumClient} */
    this._electrumClient = new ElectrumClient(config)

    /** @private @type {Uint8Array} */
    this._masterKeyAndChainCodeBuffer =
      hmac(sha512, tools.fromUtf8('Bitcoin seed'), seedBuffer)

    /** @private @type {Uint8Array} */
    this._privateKeyBuffer = this._masterKeyAndChainCodeBuffer.slice(0, 32)

    /** @private @type {Uint8Array} */
    this._chainCodeBuffer = this._masterKeyAndChainCodeBuffer.slice(32)

    /** @private @type {import('bip32').BIP32Interface} */
    this._bip32 = bip32.fromPrivateKey(
      Buffer.from(this._privateKeyBuffer),
      Buffer.from(this._chainCodeBuffer),
      BITCOIN
    )

    this._initialize(path)
  }

  get path () {
    return this._path
  }

  get index () {
    return +this._path.split('/').pop()
  }

  get keyPair () {
    return this._keyPair
  }

  /**
   * @private
   * @param {string} path
   */
  _initialize (path) {
    this._path = `${BIP_84_BTC_DERIVATION_PATH_PREFIX}/${path}`

    const wallet = this._bip32.derivePath(this._path)

    this._address = payments.p2wpkh({
      pubkey: wallet.publicKey,
      network: this._electrumClient.network
    }).address

    this._keyPair = {
      publicKey: wallet.publicKey,
      privateKey: this._privateKeyBuffer
    }
  }

  async getAddress () {
    return this._address
  }

  async sign (message) {
    const messageHash = crypto.sha256(Buffer.from(message))
    return this._bip32.sign(messageHash).toString('base64')
  }

  async verify (message, signature) {
    const messageHash = crypto.sha256(Buffer.from(message))
    const signatureBuffer = Buffer.from(signature, 'base64')
    try {
      const z = this._bip32.verify(messageHash, signatureBuffer)
      return z
    } catch (_) {
      return false
    }
  }

  /**
   * Sends a transaction.
   *
   * @param {BtcTransaction} tx - The transaction.
   * @returns {Promise<BtcTransactionResult>} The transaction's result.
   */
  async sendTransaction ({ to, value }) {
    const tx = await this._getTransaction({ recipient: to, amount: value })
    await this._broadcastTransaction(tx.hex)
    return tx.txid
  }

  /**
   * Quotes the costs of a send transaction operation.
   *
   * @param {BtcTransaction} tx - The transaction.
   * @returns {Promise<Omit<BtcTransactionResult, 'hash'>>} The transaction's quotes.
   */
  async quoteTransaction ({ to, value }) {
    const tx = await this._getTransaction({ recipient: to, amount: value })
    return +tx.fee
  }

  /**
   * Returns the account's bitcoin balance.
   *
   * @returns {Promise<number>} The bitcoin balance (in satoshis).
   */
  async getBalance () {
    const address = await this.getAddress()
    const { confirmed } = await this._electrumClient.getBalance(address)
    return +confirmed
  }

  async getTokenBalance (tokenAddress) {
    throw new UnsupportedOperationError('getTokenBalance')
  }

  async transfer (options) {
    throw new UnsupportedOperationError('transfer')
  }

  async quoteTransfer (options) {
    throw new UnsupportedOperationError('quoteTransfer')
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
    const history = await this._electrumClient.getHistory(address)

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
          const prevTx = await this._electrumClient.getTransaction(vin.txid)
          total += prevTx.vout[vin.vout].value
        } catch (_) {}
      }
      return total
    }

    const isOutgoingTx = async (vinList) => {
      for (const vin of vinList) {
        try {
          const prevTx = await this._electrumClient.getTransaction(vin.txid)
          if (isAddressMatch(prevTx.vout[vin.vout].scriptPubKey, address)) return true
        } catch (_) {}
      }
      return false
    }

    const transfers = []

    for (const item of history.slice(skip)) {
      if (transfers.length >= limit) break
      const tx = await this._electrumClient.getTransaction(item.tx_hash)
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

        transfers.push({ txid: item.tx_hash, height: item.height, value: vout.value, vout: index, direction: directionType, recipient, fee, address })
      }
    }

    return transfers
  }

  async _getTransaction ({ recipient, amount }) {
    const address = await this.getAddress()
    const utxoSet = await this._getUtxos(amount, address)
    const feeEstimate = await this._electrumClient.getFeeEstimate()
    return await this._getRawTransaction(utxoSet, amount, recipient, feeEstimate)
  }

  async _getUtxos (amount, address) {
    const unspent = await this._electrumClient.getUnspent(address)
    if (!unspent || unspent.length === 0) throw new Error('No unspent outputs available.')
    const collected = []
    let totalCollected = new BigNumber(0)
    for (const utxo of unspent) {
      const tx = await this._electrumClient.getTransaction(utxo.tx_hash)
      const vout = tx.vout[utxo.tx_pos]
      collected.push({ ...utxo, vout })
      totalCollected = totalCollected.plus(utxo.value)
      if (totalCollected.isGreaterThan(amount)) break
    }
    return collected
  }

  async _getRawTransaction (utxoSet, amount, recipient, feeRate) {
    if (+amount <= DUST_LIMIT) throw new Error(`The amount must be bigger than the dust limit (= ${DUST_LIMIT}).`)
    const totalInput = utxoSet.reduce((sum, utxo) => sum.plus(utxo.value), new BigNumber(0))

    const createPsbt = async (fee) => {
      const psbt = new Psbt({ network: this._electrumClient.network })
      utxoSet.forEach((utxo, index) => {
        psbt.addInput({
          hash: utxo.tx_hash,
          index: utxo.tx_pos,
          witnessUtxo: { script: Buffer.from(utxo.vout.scriptPubKey.hex, 'hex'), value: utxo.value },
          bip32Derivation: [{ masterFingerprint: this._bip32.fingerprint, path: this.path, pubkey: this.keyPair.publicKey }]
        })
      })
      psbt.addOutput({ address: recipient, value: amount })
      const change = totalInput.minus(amount).minus(fee)
      if (change.isGreaterThan(DUST_LIMIT)) psbt.addOutput({ address: await this.getAddress(), value: change.toNumber() })
      else if (change.isLessThan(0)) throw new Error('Insufficient balance to send the transaction.')
      utxoSet.forEach((_, index) => psbt.signInputHD(index, this._bip32))
      psbt.finalizeAllInputs()
      return psbt
    }

    let psbt = await createPsbt(0)
    const dummyTx = psbt.extractTransaction()
    let estimatedFee = new BigNumber(feeRate).multipliedBy(dummyTx.virtualSize()).integerValue(BigNumber.ROUND_CEIL)
    estimatedFee = BigNumber.max(estimatedFee, new BigNumber(141))
    psbt = await createPsbt(estimatedFee)

    const tx = psbt.extractTransaction()
    return { txid: tx.getId(), hex: tx.toHex(), fee: estimatedFee }
  }

  async _broadcastTransaction (txHex) {
    return await this._electrumClient.broadcastTransaction(txHex)
  }

  dispose () {
    // Zero out sensitive buffers
    sodium.sodium_memzero(this._privateKeyBuffer)
    sodium.sodium_memzero(this._chainCodeBuffer)
    sodium.sodium_memzero(this._masterKeyAndChainCodeBuffer)
    sodium.sodium_memzero(this._keyPair.privateKey)
    sodium.sodium_memzero(this._keyPair.publicKey)
    sodium.sodium_memzero(this._bip32.__Q)
    sodium.sodium_memzero(this._bip32.__D)

    // Null private props
    this._bip32 = null
    this._keyPair = null
    this._address = null
    this._path = null
    this._privateKeyBuffer = null
    this._chainCodeBuffer = null
    this._masterKeyAndChainCodeBuffer = null

    // Disconnect Electrum
    if (this._electrumClient?.disconnect) this._electrumClient.disconnect()
  }
}
