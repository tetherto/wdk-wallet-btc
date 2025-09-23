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

import { WalletAccountReadOnly } from '@wdk/wallet'

import { coinselect } from '@bitcoinerlab/coinselect'
import { DescriptorsFactory } from '@bitcoinerlab/descriptors'
import * as ecc from '@bitcoinerlab/secp256k1'

import { address as btcAddress, crypto, networks, Transaction } from 'bitcoinjs-lib'

import ElectrumClient from './electrum-client.js'

/** @typedef {import('@bitcoinerlab/coinselect').OutputWithValue} OutputWithValue */
/** @typedef {import('bitcoinjs-lib').Network} Network */
/** @typedef {import('bitcoinjs-lib').Transaction} BtcTransactionReceipt */

/** @typedef {import('@wdk/wallet').TransactionResult} TransactionResult */
/** @typedef {import('@wdk/wallet').TransferOptions} TransferOptions */
/** @typedef {import('@wdk/wallet').TransferResult} TransferResult */

/**
 * @typedef {Object} BtcTransaction
 * @property {string} to - The transaction's recipient.
 * @property {number | bigint} value - The amount of bitcoins to send to the recipient (in satoshis).
 */

/**
 * @typedef {Object} BtcWalletConfig
 * @property {string} [host] - The electrum server's hostname (default: "electrum.blockstream.info").
 * @property {number} [port] - The electrum server's port (default: 50001).
 * @property {"bitcoin" | "regtest" | "testnet"} [network] The name of the network to use (default: "bitcoin").
 * @property {"tcp" | "tls" | "ssl"} [protocol] - The transport protocol to use (default: "tcp").
 * @property {44 | 84} [bip] - The bip address type; available values: 44 or 84 (default: 44).
*/

const { Output } = DescriptorsFactory(ecc)

const MIN_TX_FEE_SATS = 141

/** @internal */
export const DUST_LIMIT = 546

export default class WalletAccountReadOnlyBtc extends WalletAccountReadOnly {
  /**
   * Creates a new bitcoin read-only wallet account.
   *
   * @param {string} address - The account's address.
   * @param {Omit<BtcWalletConfig, 'bip'>} [config] - The configuration object.
   */
  constructor (address, config = {}) {
    super(address)

    /**
     * The read-only wallet account configuration.
     *
     * @protected
     * @type {Omit<BtcWalletConfig, 'bip'>}
     */
    this._config = config

    /**
     * The network.
     *
     * @protected
     * @type {Network}
     */
    this._network = networks[this._config.network] || networks.bitcoin

    /**
     * An electrum client to interact with the bitcoin node.
     *
     * @protected
     * @type {ElectrumClient}
     */
    this._electrumClient = new ElectrumClient(
      config.port || 50_001,
      config.host || 'electrum.blockstream.info',
      config.protocol || 'tcp',
      { retryPeriod: 1_000, maxRetry: 2, pingPeriod: 120_000, callback: null }
    )
  }

  /**
   * Returns the account's bitcoin balance.
   *
   * @returns {Promise<bigint>} The bitcoin balance (in satoshis).
   */
  async getBalance () {
    const scriptHash = await this._getScriptHash()

    try {
      const { confirmed } = await this._electrumClient.blockchainScripthash_getBalance(scriptHash)

      return BigInt(confirmed)
    } catch (e) {
      throw new Error(`Failed to fetch balance from Electrum: ${e.message}`)
    }
  }

  /**
   * Returns the account balance for a specific token.
   *
   * @param {string} tokenAddress - The smart contract address of the token.
   * @returns {Promise<bigint>} The token balance (in base unit).
   */
  async getTokenBalance (tokenAddress) {
    throw new Error("The 'getTokenBalance' method is not supported on the bitcoin blockchain.")
  }

  /**
   * Quotes the costs of a send transaction operation.
   *
   * @param {BtcTransaction} tx - The transaction.
   * @returns {Promise<Omit<TransactionResult, 'hash'>>} The transaction's quotes.
   */
  async quoteSendTransaction ({ to, value }) {
    const address = await this.getAddress()

    let feeRate

    try {
      feeRate = await this._electrumClient.blockchainEstimatefee(1)
    } catch (e) {
      throw new Error(`Failed to estimate fee with Electrum: ${e.message}`)
    }

    const { fee } = await this._planSpend({
      fromAddress: address,
      toAddress: to,
      amount: value,
      feeRate: Math.max(Number(feeRate) * 100_000, 1)
    })

    return { fee: BigInt(fee) }
  }

  /**
   * Quotes the costs of a transfer operation.
   *
   * @param {TransferOptions} options - The transfer's options.
   * @returns {Promise<Omit<TransferResult, 'hash'>>} The transfer's quotes.
   */
  async quoteTransfer (options) {
    throw new Error("The 'quoteTransfer' method is not supported on the bitcoin blockchain.")
  }

  /**
   * Returns a transaction's receipt.
   *
   * @param {string} hash - The transaction's hash.
   * @returns {Promise<BtcTransactionReceipt | null>} – The receipt, or null if the transaction has not been included in a block yet.
   */
  async getTransactionReceipt (hash) {
    if (!/^[0-9a-fA-F]{64}$/.test(hash)) {
      throw new Error("The 'getTransactionReceipt(hash)' method requires a valid transaction hash to fetch the receipt.")
    }

    const scriptHash = await this._getScriptHash()

    try {
      const history = await this._electrumClient.blockchainScripthash_getHistory(scriptHash)
      const item = Array.isArray(history) ? history.find(h => h?.tx_hash === hash) : null

      if (!item || !item.height || item.height <= 0) {
        return null
      }

      const hex = await this._electrumClient.blockchainTransaction_get(hash, false)

      const transaction = Transaction.fromHex(hex)

      return transaction
    } catch (e) {
      throw new Error(`Failed to get transaction receipt for hash ${hash}: ${e.message}`)
    }
  }

  /**
   * Computes the sha-256 hash of the output script for this wallet's address, reverses the byte order,
   * and returns it as a hex string.
   *
   * @protected
   * @returns {Promise<string>} The reversed sha-256 script hash as a hex-encoded string.
   */
  async _getScriptHash () {
    const address = await this.getAddress()
    const script = btcAddress.toOutputScript(address, this._network)
    const hash = crypto.sha256(script)

    const buffer = Buffer.from(hash).reverse()

    return buffer.toString('hex')
  }

  /**
   * Builds and returns a fee-aware funding plan for sending a transaction.
   *
   * Uses descriptors + coinselect to choose inputs, at a given feeRate (sats/vB). Returns the selected
   * UTXOs (in the shape expected by the PSBT builder), the computed fee, and the resulting change value.
   *
   * @protected
   * @param {Object} tx - The transaction.
   * @param {string} tx.fromAddress - The sender's address.
   * @param {string} tx.toAddress - The recipient's address.
   * @param {number | bigint} tx.amount - The amount to send (in satoshis).
   * @param {number} tx.feeRate - The fee rate (in sats/vB).
   * @returns {Promise<{ utxos: OutputWithValue[], fee: number, changeValue: number }>} - The funding plan.
   */
  async _planSpend ({ fromAddress, toAddress, amount, feeRate }) {
    if (amount <= DUST_LIMIT) {
      throw new Error(`The amount must be bigger than the dust limit (= ${DUST_LIMIT}).`)
    }

    const network = this._network

    const fromAddressScriptHex = btcAddress.toOutputScript(fromAddress, network).toString('hex')
    const fromAddressOutput = new Output({ descriptor: `addr(${fromAddress})`, network })
    const toAddressOutput = new Output({ descriptor: `addr(${toAddress})`, network })

    const scriptHash = await this._getScriptHash()

    let unspent

    try {
      unspent = await this._electrumClient.blockchainScripthash_listunspent(scriptHash)
    } catch (e) {
      throw new Error(`Failed to fetch UTXO list from Electrum: ${e.message}`)
    }

    if (!unspent || unspent.length === 0) {
      throw new Error('No unspent outputs available.')
    }

    const utxosForCoinSelect = unspent.map(u => ({
      output: fromAddressOutput,
      value: u.value,
      __ref: u
    }))

    const result = coinselect({
      utxos: utxosForCoinSelect,
      remainder: fromAddressOutput,
      targets: [{ output: toAddressOutput, value: Number(amount) }],
      feeRate: Math.max(Number(feeRate) || 0, 1)
    })

    if (!result) {
      throw new Error('Insufficient balance to send the transaction.')
    }

    const fee = Number.isFinite(result.fee)
      ? Math.max(result.fee, MIN_TX_FEE_SATS)
      : MIN_TX_FEE_SATS

    const utxos = result.utxos.map(({ __ref }) => ({
      ...__ref,
      vout: { value: __ref.value, scriptPubKey: { hex: fromAddressScriptHex } }
    }))

    const total = utxos.reduce((s, u) => s + u.value, 0)

    const changeValue = total - fee - Number(amount)

    if (changeValue < 0) {
      throw new Error('Insufficient balance after fees.')
    }

    if (changeValue <= DUST_LIMIT) {
      return { utxos, fee: fee + changeValue, changeValue: 0 }
    }

    return { utxos, fee, changeValue }
  }
}
