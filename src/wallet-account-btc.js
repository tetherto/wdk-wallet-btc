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

import { hmac } from '@noble/hashes/hmac'
import { sha512 } from '@noble/hashes/sha512'
import { address as btcAddress, crypto, initEccLib, networks, payments, Psbt, Transaction } from 'bitcoinjs-lib'
import { BIP32Factory } from 'bip32'

import * as bip39 from 'bip39'
import * as ecc from '@bitcoinerlab/secp256k1'

// eslint-disable-next-line camelcase
import { sodium_memzero } from 'sodium-universal'

import WalletAccountReadOnlyBtc, { DUST_LIMIT } from './wallet-account-read-only-btc.js'

/** @typedef {import('@tetherto/wdk-wallet').IWalletAccount} IWalletAccount */

/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet').TransferResult} TransferResult */

/** @typedef {import('./wallet-account-read-only-btc.js').BtcTransaction} BtcTransaction */
/** @typedef {import('./wallet-account-read-only-btc.js').BtcWalletConfig} BtcWalletConfig */

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

  sodium_memzero(masterKeyAndChainCodeBuffer)
  sodium_memzero(privateKey)
  sodium_memzero(chainCode)

  return { masterNode, account }
}

/** @implements {IWalletAccount} */
export default class WalletAccountBtc extends WalletAccountReadOnlyBtc {
  /**
   * Creates a new bitcoin wallet account.
   *
   * @param {string | Uint8Array} seed - The wallet's [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) seed phrase.
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

    const bip = config.bip ?? 44

    if (![44, 84].includes(bip)) {
      throw new Error('Invalid bip specification. Supported bips: 44, 84.')
    }

    const fullPath = `m/${bip}'/0'/${path}`

    const { masterNode, account } = derivePath(seed, fullPath)

    const network = networks[config.network] || networks.bitcoin

    const { address } = bip === 44
      ? payments.p2pkh({ pubkey: account.publicKey, network })
      : payments.p2wpkh({ pubkey: account.publicKey, network })

    super(address, config)

    /**
     * The wallet account configuration.
     *
     * @protected
     * @type {BtcWalletConfig}
     */
    this._config = config

    /** @private */
    this._path = fullPath

    /** @private */
    this._bip = bip

    /** @private */
    this._masterNode = masterNode

    /** @private */
    this._account = account
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
      privateKey: this._account ? new Uint8Array(this._account.privateKey) : null,
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
    const address = await this.getAddress()

    const feeEstimate = await this._electrumClient.blockchainEstimatefee(1)

    const feeRate = Math.max(Number(feeEstimate) * 100_000, 1)

    const { utxos, fee, changeValue } = await this._planSpend({
      fromAddress: address,
      toAddress: to,
      amount: value,
      feeRate
    })

    const tx = await this._getRawTransaction({ utxos, to, value, fee, feeRate, changeValue })

    await this._electrumClient.blockchainTransaction_broadcast(tx.hex)

    return { hash: tx.txid, fee: BigInt(tx.fee) }
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

    const net = this._network
    const scriptHash = await this._getScriptHash()
    const history = await this._electrumClient.blockchainScripthash_getHistory(scriptHash)

    const address = await this.getAddress()
    const myScript = btcAddress.toOutputScript(address, net)

    const txCache = new Map()
    const getTx = async (txid) => {
      if (txCache.has(txid)) return txCache.get(txid)
      const tx = Transaction.fromHex(await this._electrumClient.blockchainTransaction_get(txid, false))
      txCache.set(txid, tx)
      return tx
    }

    const transfers = []

    for (const item of history.slice(skip)) {
      if (transfers.length >= limit) break

      let tx
      try { tx = await getTx(item.tx_hash) } catch (_) { continue }

      let totalInput = 0
      let isOutgoing = false

      const prevOuts = await Promise.all(
        tx.ins.map(async (input) => {
          try {
            const prevId = Buffer.from(input.hash).reverse().toString('hex')
            const prevTx = await getTx(prevId)
            const prevOut = prevTx.outs[input.index]
            return prevOut || null
          } catch (_) {
            return null
          }
        })
      )

      for (const prevOut of prevOuts) {
        if (!prevOut) continue
        totalInput += prevOut.value
        if (!isOutgoing && Buffer.compare(prevOut.script, myScript) === 0) {
          isOutgoing = true
        }
      }

      const totalOutput = tx.outs.reduce((sum, o) => sum + o.value, 0)
      const fee = totalInput > 0 ? (totalInput - totalOutput) : null

      for (let vout = 0; vout < tx.outs.length; vout++) {
        const out = tx.outs[vout]
        const toSelf = Buffer.compare(out.script, myScript) === 0

        let directionType = null
        if (toSelf && !isOutgoing) directionType = 'incoming'
        else if (!toSelf && isOutgoing) directionType = 'outgoing'
        else if (toSelf && isOutgoing) directionType = 'change'
        else continue

        if (directionType === 'change') continue
        if (direction !== 'all' && direction !== directionType) continue
        if (transfers.length >= limit) break

        let recipient = null
        try { recipient = btcAddress.fromOutputScript(out.script, net) } catch (_) {}

        transfers.push({
          txid: item.tx_hash,
          height: item.height,
          value: out.value,
          vout,
          direction: directionType,
          recipient,
          fee,
          address
        })
      }
    }

    return transfers
  }

  /**
   * Returns a read-only copy of the account.
   *
   * @returns {Promise<WalletAccountReadOnlyBtc>} The read-only account.
   */
  async toReadOnlyAccount () {
    const btcReadOnlyAccount = new WalletAccountReadOnlyBtc(this._address, this._config)

    return btcReadOnlyAccount
  }

  /**
   * Disposes the wallet account, erasing the private key from memory and closing the connection with the electrum server.
   */
  dispose () {
    sodium_memzero(this._account.privateKey)
    sodium_memzero(this._account.chainCode)

    sodium_memzero(this._masterNode.privateKey)
    sodium_memzero(this._masterNode.chainCode)

    this._account = undefined

    this._masterNode = undefined

    this._electrumClient.close()
  }

  /** @private */
  async _getRawTransaction ({ utxos, to, value, fee, feeRate, changeValue }) {
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

      for (const utxo of utxos) {
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

      psbt.addOutput({ address: to, value: rcptVal })
      if (chgVal > 0) {
        psbt.addOutput({ address: await this.getAddress(), value: chgVal })
      }

      utxos.forEach((_, index) => psbt.signInputHD(index, this._masterNode))
      psbt.finalizeAllInputs()

      const tx = psbt.extractTransaction()
      return tx
    }

    let currentRecipientAmnt = Number(value)
    let currentChange = changeValue
    let currentFee = fee

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

    return { txid: tx.getId(), hex: tx.toHex(), fee: currentFee }
  }
}
