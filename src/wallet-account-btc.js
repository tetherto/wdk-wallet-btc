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

import { crypto, initEccLib, payments, Psbt, networks } from 'bitcoinjs-lib'
import { BIP32Factory } from 'bip32'

import { hmac } from '@noble/hashes/hmac'
import { sha512 } from '@noble/hashes/sha512'

import * as bip39 from 'bip39'
import * as ecc from '@bitcoinerlab/secp256k1'

// eslint-disable-next-line camelcase
import { sodium_memzero } from 'sodium-universal'

import WalletAccountReadOnlyBtc, { DUST_LIMIT } from './wallet-account-read-only-btc.js'

/** @typedef {import('@wdk/wallet').IWalletAccount} IWalletAccount */
/** @typedef {import('@wdk/wallet').KeyPair} KeyPair */
/** @typedef {import('@wdk/wallet').TransactionResult} TransactionResult */
/** @typedef {import('@wdk/wallet').TransferOptions} TransferOptions */
/** @typedef {import('@wdk/wallet').TransferResult} TransferResult */

/** @typedef {import('./wallet-account-read-only-btc.js').BtcTransaction} BtcTransaction */
/** @typedef {import('./wallet-account-read-only-btc.js').BtcWalletConfig} BtcWalletConfig */

const MASTER_SECRET = Buffer.from('Bitcoin seed', 'utf8')

const BITCOIN = {
  wif: 0x80,
  bip32: { public: 0x0488b21e, private: 0x0488ade4 },
  messagePrefix: '\x18Bitcoin Signed Message:\n',
  bech32: 'bc',
  pubKeyHash: 0x00,
  scriptHash: 0x05
}

const bip32 = BIP32Factory(ecc)
initEccLib(ecc)

function derivePath (seed, path) {
  const masterKeyAndChainCodeBuffer = hmac(sha512, MASTER_SECRET, seed)

  const privateKey = masterKeyAndChainCodeBuffer.slice(0, 32)
  const chainCode = masterKeyAndChainCodeBuffer.slice(32)

  const masterNode = bip32.fromPrivateKey(Buffer.from(privateKey), Buffer.from(chainCode), BITCOIN)
  const account = masterNode.derivePath(path)

  sodium_memzero(privateKey)
  sodium_memzero(chainCode)
  sodium_memzero(masterKeyAndChainCodeBuffer)

  return { masterNode, account }
}

/** @implements {IWalletAccount} */
export default class WalletAccountBtc extends WalletAccountReadOnlyBtc {
  /**
   * Creates a new bitcoin wallet account.
   *
   * @param {string | Uint8Array} seed - The wallet's BIP-39 seed phrase.
   * @param {string} path - The derivation path suffix (e.g. "0'/0/0").
   * @param {BtcWalletConfig} [config] - The configuration object.
   */
  constructor (seed, path, config = {}) {
    if (typeof seed === 'string') {
      if (!bip39.validateMnemonic(seed)) {
        throw new Error('The seed phrase is invalid.')
      }
      seed = bip39.mnemonicToSeedSync(seed)
    }

    const bip = (config.bip ?? 44)
    if (bip !== 44 && bip !== 84) {
      throw new Error(`Unsupported BIP type: ${bip}`)
    }
    const fullPath = `m/${bip}'/0'/${path}`

    const { masterNode, account } = derivePath(seed, fullPath)

    if (typeof seed === 'string') {
      sodium_memzero(seed)
    }

    const net = networks[config.network] || networks.bitcoin

    const { address } = (bip === 44)
      ? payments.p2pkh({ pubkey: account.publicKey, network: net })
      : payments.p2wpkh({ pubkey: account.publicKey, network: net })

    super(address, config)

    /**
     * The derivation path of this account.
     *
     * @protected
     * @type {string}
     */
    this._path = fullPath

    /**
     * Track BIP for input model decisions.
     * @protected
     * @type {44|84}
     */
    this._bip = bip

    /**
     * The BIP32 master node.
     *
     * @protected
     * @type {import('bip32').BIP32Interface}
     */
    this._masterNode = masterNode

    /**
     * The derived BIP32 account.
     *
     * @protected
     * @type {import('bip32').BIP32Interface}
     */
    this._account = account

    // keep network handy for PSBT/network ops
    this._network = net
  }

  /** @type {number} */
  get index () {
    return +this._path.split('/').pop()
  }

  /**
   * The derivation path of this account.
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
      privateKey: new Uint8Array(this._account.privateKey),
      publicKey: new Uint8Array(this._account.publicKey)
    }
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
   * Sends a transaction.
   *
   * @param {BtcTransaction} tx - The transaction.
   * @returns {Promise<TransactionResult>} The transaction's result.
   */
  async sendTransaction ({ to, value }) {
    const tx = await this._getTransaction({ recipient: to, amount: value })
    await this._electrumClient.blockchainTransaction_broadcast(tx.hex)
    return { hash: tx.txid, fee: +tx.fee }
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
   * Returns a read-only copy of the account.
   * @returns {Promise<WalletAccountReadOnlyBtc>} The read-only account.
   */
  async toReadOnlyAccount () {
    const address = await this.getAddress()
    return new WalletAccountReadOnlyBtc(address, this._config)
  }

  /**
   * Disposes the wallet account, erasing the private key from memory and closing the connection with the electrum server.
   */
  dispose () {
    // Zero out derived node material (memory hygiene)
    try { sodium_memzero(this._account.privateKey) } catch (_) {}
    try { sodium_memzero(this._account.chainCode) } catch (_) {}

    try { sodium_memzero(this._masterNode.privateKey) } catch (_) {}
    try { sodium_memzero(this._masterNode.chainCode) } catch (_) {}

    this._account = undefined
    this._masterNode = undefined

    this._electrumClient.close()
  }

  /**
   * Build and fee-estimate a transaction for this account.
   *
   * @protected
   * @param {{ recipient: string, amount: number }} params
   * @returns {Promise<{ txid: string, hex: string, fee: number }>}
   */
  async _getTransaction ({ recipient, amount }) {
    const from = await this.getAddress()

    let feeRate = await this._electrumClient.blockchainEstimatefee(1)
    feeRate = Math.max(Number(feeRate) * 100000, 1)

    const { utxos, fee, changeValue } = await this._planSpend({
      fromAddress: from,
      toAddress: recipient,
      amount,
      feeRate
    })

    const tx = await this._getRawTransaction(utxos, recipient, amount, changeValue, fee, feeRate)
    return tx
  }

  /**
   * Build and sign a PSBT from the spend plan. If real vsize requires a higher fee, do one clean rebalance.
   * Supports both SegWit (BIP84) and legacy P2PKH (BIP44) inputs.
   *
   * @protected
   * @param {Array<any>} utxoSet
   * @param {string} recipientAddress
   * @param {number} recipientAmnt
   * @param {number} changeValue
   * @param {number} plannedFee
   * @param {number} feeRate
   * @returns {Promise<{ txid: string, hex: string, fee: number, vsize: number }>}
   */
  async _getRawTransaction (utxoSet, recipientAddress, recipientAmnt, changeValue, plannedFee, feeRate) {
    const isSegwit = (this._bip === 84)

    const legacyPrevTxCache = new Map()
    const getPrevTxHex = async (txid) => {
      if (legacyPrevTxCache.has(txid)) return legacyPrevTxCache.get(txid)
      const hex = await this._electrumClient.blockchainTransaction_get(txid, false)
      legacyPrevTxCache.set(txid, hex)
      return hex
    }

    const buildAndSign = async (rcptVal, chgVal) => {
      const psbt = new Psbt({ network: this._network })

      for (const utxo of utxoSet) {
        const baseInput = {
          hash: utxo.tx_hash,
          index: utxo.tx_pos,
          bip32Derivation: [{
            masterFingerprint: this._masterNode.fingerprint,
            path: this._path,
            pubkey: this._account.publicKey
          }]
        }

        if (isSegwit) {
          psbt.addInput({
            ...baseInput,
            witnessUtxo: {
              script: Buffer.from(utxo.vout.scriptPubKey.hex, 'hex'),
              value: utxo.value
            }
          })
        } else {
          const prevHex = await getPrevTxHex(utxo.tx_hash)
          psbt.addInput({
            ...baseInput,
            nonWitnessUtxo: Buffer.from(prevHex, 'hex')
          })
        }
      }

      psbt.addOutput({ address: recipientAddress, value: rcptVal })
      if (chgVal > 0) {
        psbt.addOutput({ address: await this.getAddress(), value: chgVal })
      }

      utxoSet.forEach((_, index) => psbt.signInputHD(index, this._masterNode))
      psbt.finalizeAllInputs()

      const tx = psbt.extractTransaction()
      return tx
    }

    let currentRecipientAmnt = recipientAmnt
    let currentChange = changeValue
    let currentFee = plannedFee

    let tx = await buildAndSign(currentRecipientAmnt, currentChange)
    let vsize = tx.virtualSize()
    let requiredFee = Math.ceil(vsize * feeRate)

    if (requiredFee <= currentFee) {
      return { txid: tx.getId(), hex: tx.toHex(), fee: currentFee, vsize }
    }

    const delta = requiredFee - currentFee
    currentFee = requiredFee

    if (currentChange > 0) {
      const newChange = currentChange - delta
      currentChange = newChange > DUST_LIMIT ? newChange : 0
      tx = await buildAndSign(currentRecipientAmnt, currentChange)
    } else {
      const newRecipientAmnt = currentRecipientAmnt - delta
      if (newRecipientAmnt <= DUST_LIMIT) {
        throw new Error(`The amount after fees must be bigger than the dust limit (= ${DUST_LIMIT}).`)
      }
      currentRecipientAmnt = newRecipientAmnt
      tx = await buildAndSign(currentRecipientAmnt, currentChange)
    }

    vsize = tx.virtualSize()
    requiredFee = Math.ceil(vsize * feeRate)
    if (requiredFee > currentFee) {
      throw new Error('Fee shortfall after output rebalance.')
    }

    return { txid: tx.getId(), hex: tx.toHex(), fee: currentFee, vsize }
  }
}
