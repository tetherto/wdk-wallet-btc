// wallet-account-btc.js
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
import BigNumber from 'bignumber.js'

import { hmac } from '@noble/hashes/hmac'
import { sha512 } from '@noble/hashes/sha512'

import * as bip39 from 'bip39'

import * as ecc from '@bitcoinerlab/secp256k1'

// eslint-disable-next-line camelcase
import { sodium_memzero } from 'sodium-universal'

import WalletAccountReadOnlyBtc from './wallet-account-read-only-btc.js'
import ElectrumClient from './electrum-client.js'

/** @typedef {import('@wdk/wallet').IWalletAccount} IWalletAccount */

/** @typedef {import('@wdk/wallet').KeyPair} KeyPair */
/** @typedef {import('@wdk/wallet').TransactionResult} TransactionResult */
/** @typedef {import('@wdk/wallet').TransferOptions} TransferOptions */
/** @typedef {import('@wdk/wallet').TransferResult} TransferResult */

/** @typedef {import('./wallet-account-read-only-btc.js').BtcTransaction} BtcTransaction */
/** @typedef {import('./wallet-account-read-only-btc.js').BtcWalletConfig} BtcWalletConfig */

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

  const privateKey = masterKeyAndChainCodeBuffer.slice(0, 32)
  const chainCode = masterKeyAndChainCodeBuffer.slice(32)

  const masterNode = bip32.fromPrivateKey(Buffer.from(privateKey), Buffer.from(chainCode), BITCOIN)

  const account = masterNode.derivePath(path)

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
    if (bip !== 44 && bip !== 84) {
      throw new Error(`Unsupported BIP type: ${bip}`)
    }
    const fullPath = `m/${bip}'/0'/${path}`

    const electrumClient = new ElectrumClient(config)
    const net = networks[config.network] || networks.bitcoin

    const { masterNode, account } = derivePath(seed, fullPath)

    const address = (bip === 44)
      ? payments.p2pkh({ pubkey: account.publicKey, network: net }).address
      : payments.p2wpkh({ pubkey: account.publicKey, network: net }).address

    super(address, config)

    this._electrumClient = electrumClient

    /**
     * The derivation path of this account.
     *
     * @protected
     * @type {string}
     */
    this._path = fullPath

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
  }

  /** @type {number} */
  get index () {
    return +this._path.split('/').pop()
  }

  /**
   * The derivation path of this account (BIP-44/84 depending on config).
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

    await this._electrumClient.broadcastTransaction(tx.hex)
    return { hash: tx.txid, fee: +tx.fee }
  }

  /**
   * Transfers a token to another address.
   *
   * @param {TransferOptions} options - The transfer's options.
   * @returns {Promise<TransferResult>} The transfer's result.
   */
  async transfer (options) {
    throw new Error(
      "The 'transfer' method is not supported on the bitcoin blockchain."
    )
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
   * Disposes the wallet account, erasing the private key from the memory and closing the connection with the electrum server.
   */
  dispose () {
    sodium_memzero(this._account.privateKey)
    this._account = undefined
    this._electrumClient.disconnect()
  }

  /**
   * Build and fee-estimate a transaction for this account.
   *
   * @protected
   * @param {{ recipient: string, amount: number }} params
   * @returns {Promise<{ txid: string, hex: string, fee: BigNumber }>}
   */
  async _getTransaction ({ recipient, amount }) {
    const address = await this.getAddress()
    const utxoSet = await this._getUtxos(amount, address)
    let feeRate = await this._electrumClient.getFeeEstimateInSatsPerVb()

    if (feeRate.lt(1)) {
      feeRate = new BigNumber(1)
    }

    const transaction = await this._getRawTransaction(
      utxoSet,
      amount,
      recipient,
      feeRate
    )

    return transaction
  }

  /**
   * Collects enough UTXOs to cover `amount`.
   *
   * @protected
   * @param {number} amount
   * @param {string} address
   * @returns {Promise<Array<any>>}
   */
  async _getUtxos (amount, address) {
    const unspent = await this._electrumClient.getUnspent(address)
    if (!unspent || unspent.length === 0) { throw new Error('No unspent outputs available.') }

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

      const isSegWit = this._isSegWitOutput(vout.script)

      utxos.push({ ...utxo, vout: collectedVout, isSegWit, fullTx: tx })
      totalCollected = totalCollected.plus(utxo.value)
      if (totalCollected.isGreaterThanOrEqualTo(amount)) break
    }
    return utxos
  }

  /**
   * Creates and signs the PSBT, estimating fees, and returns the final tx.
   *
   * @protected
   * @param {Array<any>} utxoSet
   * @param {number} amount
   * @param {string} recipient
   * @param {BigNumber} feeRate - sats/vB
   * @returns {Promise<{ txid: string, hex: string, fee: BigNumber }>}
   */
  async _getRawTransaction (utxoSet, amount, recipient, feeRate) {
    if (+amount <= DUST_LIMIT) {
      throw new Error(
        `The amount must be bigger than the dust limit (= ${DUST_LIMIT}).`
      )
    }
    const totalInput = utxoSet.reduce(
      (sum, utxo) => sum.plus(utxo.value),
      new BigNumber(0)
    )

    const createPsbt = async (fee) => {
      const psbt = new Psbt({ network: this._electrumClient.network })
      utxoSet.forEach((utxo, index) => {
        const inputData = {
          hash: utxo.tx_hash,
          index: utxo.tx_pos,
          bip32Derivation: [
            {
              masterFingerprint: this._masterNode.fingerprint,
              path: this._path,
              pubkey: this._account.publicKey
            }
          ]
        }

        if (utxo.isSegWit) {
          inputData.witnessUtxo = {
            script: Buffer.from(utxo.vout.scriptPubKey.hex, 'hex'),
            value: utxo.value
          }
        } else {
          inputData.nonWitnessUtxo = Buffer.from(utxo.fullTx.toHex(), 'hex')
        }

        psbt.addInput(inputData)
      })
      psbt.addOutput({ address: recipient, value: amount })
      const change = totalInput.minus(amount).minus(fee)
      if (change.isGreaterThan(DUST_LIMIT)) {
        psbt.addOutput({
          address: await this.getAddress(),
          value: change.toNumber()
        })
      } else if (change.isLessThan(0)) { throw new Error('Insufficient balance to send the transaction.') }
      utxoSet.forEach((_, index) => psbt.signInputHD(index, this._masterNode))
      psbt.finalizeAllInputs()
      return psbt
    }

    let psbt = await createPsbt(0)
    const dummyTx = psbt.extractTransaction()
    let estimatedFee = new BigNumber(feeRate)
      .multipliedBy(dummyTx.virtualSize())
      .integerValue(BigNumber.ROUND_CEIL)
    estimatedFee = BigNumber.max(estimatedFee, new BigNumber(141))

    psbt = await createPsbt(estimatedFee)
    const tx = psbt.extractTransaction()
    return { txid: tx.getId(), hex: tx.toHex(), fee: estimatedFee }
  }

  /** @private */
  _isSegWitOutput (script) {
    const scriptHex = script.toString('hex')
    return (scriptHex.length === 44 && scriptHex.startsWith('0014')) ||
           (scriptHex.length === 68 && scriptHex.startsWith('0020'))
  }
}
