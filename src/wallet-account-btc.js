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

import { crypto, initEccLib, payments, Psbt } from 'bitcoinjs-lib'
import { BIP32Factory } from 'bip32'
import BigNumber from 'bignumber.js'

import { hmac } from '@noble/hashes/hmac'
import { sha512 } from '@noble/hashes/sha512'

import * as bip39 from 'bip39'

import * as ecc from '@bitcoinerlab/secp256k1'

// eslint-disable-next-line camelcase
import { sodium_memzero } from 'sodium-universal'

import ElectrumClient from './electrum-client.js'

/** @typedef {import('@wdk/wallet').KeyPair} KeyPair */
/** @typedef {import('@wdk/wallet').TransactionResult} TransactionResult */
/** @typedef {import('@wdk/wallet').TransferOptions} TransferOptions */
/** @typedef {import('@wdk/wallet').TransferResult} TransferResult */

/** @typedef {import('@wdk/wallet').IWalletAccount} IWalletAccount */

/**
 * @typedef {Object} BtcTransaction
 * @property {string} to - The transaction's recipient.
 * @property {number} value - The amount of bitcoins to send to the recipient (in satoshis).
 */

/**
 * @typedef {Object} BtcWalletConfig
 * @property {string} [host] - The electrum server's hostname (default: "electrum.blockstream.info").
 * @property {number} [port] - The electrum server's port (default: 50001).
 * @property {"bitcoin" | "regtest" | "testnet"} [network] The name of the network to use (default: "bitcoin").
 */

/**
 * @typedef {Object} BtcTransfer
 * @property {string} txid - The transaction's id.
 * @property {string} address - The user's own address.
 * @property {number} vout - The index of the output in the transaction.
 * @property {number} height - The block height (if unconfirmed, 0).
 * @property {number} value - The value of the transfer (in satoshis).
 * @property {"incoming" | "outgoing"} direction - The direction of the transfer.
 * @property {number} [fee] - The fee paid for the full transaction (in satoshis).
 * @property {string} [recipient] - The receiving address for outgoing transfers.
 */

const BIP_84_BTC_DERIVATION_PATH_PREFIX = "m/84'/0'"

const DUST_LIMIT = 546

const MASTER_SECRET = Buffer.from('Bitcoin seed', 'utf8')

const BITCOIN = {
  wif: 0x80,
  bip32: { 
    public: 0x0488b21e,
    private: 0x0488ade4
  },
  messagePrefix: '\x18Bitcoin Signed Message:\n',
  bech32: 'bc',
  pubKeyHash: 0x00,
  scriptHash: 0x05
}

const bip32 = BIP32Factory(ecc)

initEccLib(ecc)

function derivePath (seed, path) {
  const masterKeyAndChainCodeBuffer = hmac(sha512, MASTER_SECRET, seed)

  const privateKey = masterKeyAndChainCodeBuffer.slice(0, 32),
        chainCode = masterKeyAndChainCodeBuffer.slice(32)

  const wallet = bip32.fromPrivateKey(Buffer.from(privateKey), Buffer.from(chainCode), BITCOIN)

  const account = wallet.derivePath(path)

  sodium_memzero(privateKey)

  sodium_memzero(chainCode)

  return account
}

/** @implements {IWalletAccount} */
export default class WalletAccountBtc {
  /**
   * Creates a new bitcoin wallet account.
   *
   * @param {string | Uint8Array} seed - The wallet's [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) seed phrase.
   * @param {string} path - The BIP-84 derivation path (e.g. "0'/0/0").
   * @param {BtcWalletConfig} [config] - The configuration object.
   */
  constructor (seed, path, config) {
    if (typeof seed === 'string') {
      if (!bip39.validateMnemonic(seed)) {
        throw new Error('The seed phrase is invalid.')
      }

      seed = bip39.mnemonicToSeedSync(seed)
    }

    /** @private */
    this._path = `${BIP_84_BTC_DERIVATION_PATH_PREFIX}/${path}`

    /** @private */
    this._electrumClient = new ElectrumClient(config)

    /** @private */
    this._account = derivePath(seed, path)

    const { address } = payments.p2wpkh({
      pubkey: this._account.publicKey,
      network: this._electrumClient.network
    })

    /** @private */
    this._address = address
  }

  /**
   * The derivation path's index of this account.
   *
   * @type {number}
   */
  get index () {
    return +this._path.split('/').pop()
  }

  /**
   * The derivation path of this account (see [BIP-84](https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki)).
   *
   * @type {string}
   */
  get path () {
    return this._path
  }

  /**
   * The account's key pair.
   *
   * @type {KeyPair}
   */
  get keyPair () {
    return {
      publicKey: this._account.publicKey,
      privateKey: this._account.privateKey
    }
  }

  /**
   * Returns the account's address.
   *
   * @returns {Promise<string>} The account's address.
   */
  async getAddress () {
    return this._address
  }

  /**
   * Signs a message.
   *
   * @param {string} message - The message to sign.
   * @returns {Promise<string>} The message's signature.
   */
  async sign (message) {
    const messageHash = crypto.sha256(Buffer.from(message, 'utf8'))
    return this._account.sign(messageHash).toString('hex')
  }

  /**
   * Verifies a message's signature.
   *
   * @param {string} message - The original message.
   * @param {string} signature - The signature to verify.
   * @returns {Promise<boolean>} True if the signature is valid.
   */
  async verify (message, signature) {
    const messageHash = crypto.sha256(Buffer.from(message, 'utf8'))
    const signatureBuffer = Buffer.from(signature, 'hex')
    return this._account.verify(messageHash, signatureBuffer)
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

  /**
   * Returns the account balance for a specific token.
   *
   * @param {string} tokenAddress - The smart contract address of the token.
   * @returns {Promise<number>} The token balance (in base unit).
   */
  async getTokenBalance (tokenAddress) {
    throw new Error("The 'getTokenBalance' method is not supported on the bitcoin blockchain.")
  }

  /**
   * Sends a transaction.
   *
   * @param {BtcTransaction} tx - The transaction.
   * @returns {Promise<TransactionResult>} The transaction's result.
   */
  async sendTransaction ({ to, value }) {
    const tx = await this._getTransaction({ recipient: to, amount: value })

    await this._electrumClient.broadcastTransaction(txHex)

    return {
      hash: tx.txid,
      fee: +tx.fee
    }
  }

  /**
   * Quotes the costs of a send transaction operation.
   * 
   * @see {@link sendTransaction}
   * @param {BtcTransaction} tx - The transaction.
   * @returns {Promise<Omit<TransactionResult, 'hash'>>} The transaction's quotes.
   */
  async quoteSendTransaction ({ to, value }) {
    const tx = await this._getTransaction({ recipient: to, amount: value })

    return {
      fee: +tx.fee
    }
  }

  /**
   * Transfers a token to another address.
   *
   * @param {TransferOptions} options - The transfer's options.
   * @returns {Promise<TransferResult>} The transfer's result.
   */
  async transfer (options) {
    throw new Error("The 'transfer' method is not supported on the bitcoin blockchain.")
  }

  /**
   * Quotes the costs of a transfer operation.
   *
   * @see {@link transfer}
   * @param {TransferOptions} options - The transfer's options.
   * @returns {Promise<Omit<TransferResult, 'hash'>>} The transfer's quotes.
   */
  async quoteTransfer (options) {
    throw new Error("The 'quoteTransfer' method is not supported on the bitcoin blockchain.")
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
          const prevVout = prevTx.vout[vin.vout]
          total += prevVout.value
        } catch (_) {}
      }
      return total
    }

    const isOutgoingTx = async (vinList) => {
      for (const vin of vinList) {
        try {
          const prevTx = await this._electrumClient.getTransaction(vin.txid)
          const prevVout = prevTx.vout[vin.vout]
          if (isAddressMatch(prevVout.scriptPubKey, address)) return true
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

  /**
   * Disposes the wallet account, erasing the private key from the memory and closing the connection with the electrum server.
   */
  dispose () {
    sodium_memzero(this._account.privateKey)

    this._account = undefined
      
    this._electrumClient.disconnect()
  }

  /** @private */
  async _getTransaction ({ recipient, amount }) {
    const address = await this.getAddress()
    const utxoSet = await this._getUtxos(amount, address)
    let feeRate = await this._electrumClient.getFeeEstimateInSatsPerVb()

    if (feeRate.lt(1)) {
      feeRate = new BigNumber(1)
    }

    const transaction = await this._getRawTransaction(utxoSet, amount, recipient, feeRate)

    return transaction
  }

  /** @private */
  async _getUtxos (amount, address) {
    const unspent = await this._electrumClient.getUnspent(address)
    if (!unspent || unspent.length === 0) throw new Error('No unspent outputs available.')

    const utxos = []
    let totalCollected = new BigNumber(0)

    for (const utxo of unspent) {
      const tx = await this._electrumClient.getTransaction(utxo.tx_hash)
      const vout = tx.outs[utxo.tx_pos]
      const scriptHex = vout.script.toString('hex')
      const collectedVout = {
        value: vout.value,
        scriptPubKey: {
          hex: scriptHex
        }
      }

      utxos.push({ ...utxo, vout: collectedVout })
      totalCollected = totalCollected.plus(utxo.value)
      if (totalCollected.isGreaterThanOrEqualTo(amount)) break
    }
    return utxos
  }

  /** @private */
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
          bip32Derivation: [{ masterFingerprint: this._account.fingerprint, path: this.path, pubkey: this.keyPair.publicKey }]
        })
      })
      psbt.addOutput({ address: recipient, value: amount })
      const change = totalInput.minus(amount).minus(fee)
      if (change.isGreaterThan(DUST_LIMIT)) psbt.addOutput({ address: await this.getAddress(), value: change.toNumber() })
      else if (change.isLessThan(0)) throw new Error('Insufficient balance to send the transaction.')
      utxoSet.forEach((_, index) => psbt.signInputHD(index, this._account))
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
}
