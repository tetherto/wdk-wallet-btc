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
import { address as btcAddress, networks, Transaction, crypto as btcCrypto } from 'bitcoinjs-lib'
import { coinselect } from '@bitcoinerlab/coinselect'
import { DescriptorsFactory } from '@bitcoinerlab/descriptors'
import * as ecc from '@bitcoinerlab/secp256k1'

import ElectrumClient from './electrum-client.js'

/** @typedef {import('@wdk/wallet').TransactionResult} TransactionResult */
/** @typedef {import('@wdk/wallet').TransferOptions} TransferOptions */

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

const { Output } = DescriptorsFactory(ecc)

export const DUST_LIMIT = 546
const MIN_TX_FEE_SATS = 141

export default class WalletAccountReadOnlyBtc extends WalletAccountReadOnly {
  /**
   * Creates a new bitcoin read-only wallet account.
   *
   * @param {string} address - The account's address.
   * @param {BtcWalletConfig} [config] - The configuration object.
   */
  constructor (address, config = {}) {
    super(address)

    /**
     * The wallet account configuration.
     *
     * @protected
     * @type {BtcWalletConfig}
     */
    this._config = config

    /**
     * Electrum client to interact with a bitcoin node.
     *
     * @protected
     * @type {ElectrumClient}
     */
    this._electrumClient = new ElectrumClient(
      config.port || 50001,
      config.host || 'electrum.blockstream.info',
      config.protocol || 'tcp',
      {
        client: 'wdk-wallet',
        version: '1.4',
        persistence: { retryPeriod: 1000, maxRetry: 2, pingPeriod: 120000, callback: null }
      }
    )

    /**
     * The bitcoin network (bitcoinjs-lib).
     * @protected
     * @type {import('bitcoinjs-lib').Network}
     */
    this._network = networks[this._config.network || 'bitcoin']
  }

  /**
   * Returns the account's bitcoin balance.
   *
   * @returns {Promise<number>} The bitcoin balance (in satoshis).
   */
  async getBalance () {
    const address = await this.getAddress()
    const { confirmed } = await this._electrumClient.blockchainScripthash_getBalance(this._getScriptHash(address))
    return +confirmed
  }

  /**
   * Returns a transaction's receipt if it is confirmed in a block.
   *
   * @param {string} hash - The transaction's hash.
   * @returns {Promise<import('bitcoinjs-lib').Transaction | null>} - The receipt, or null if not yet included in a block.
   */
  async getTransactionReceipt (hash) {
    if (!/^[0-9a-fA-F]{64}$/.test(hash)) {
      throw new Error("The 'getTransactionReceipt(hash)' method requires a valid transaction hash to fetch the receipt.")
    }

    const address = await this.getAddress()
    const history = await this._electrumClient.blockchainScripthash_getHistory(this._getScriptHash(address))
    const item = Array.isArray(history) ? history.find(h => h && h.tx_hash === hash) : null

    if (!item) return null
    if (!item.height || item.height <= 0) return null

    const rawTx = await this._electrumClient.blockchainTransaction_get(hash, false)
    return Transaction.fromHex(rawTx)
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
   * Quotes the costs of a send transaction operation.
   *
   * @param {BtcTransaction} tx - The transaction.
   * @returns {Promise<Omit<TransactionResult, 'hash'>>} The transaction's quotes.
   */
  async quoteSendTransaction ({ to, value }) {
    const from = await this.getAddress()
    let feeRate = await this._electrumClient.blockchainEstimatefee(1)
    feeRate = Math.max(Number(feeRate) * 100000, 1)

    const { fee } = await this._planSpend({ fromAddress: from, toAddress: to, amount: value, feeRate })
    return { fee }
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
    const net = this._network
    const history = await this._electrumClient.blockchainScripthash_getHistory(this._getScriptHash(address))

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
      try {
        tx = await getTx(item.tx_hash)
      } catch (_) { continue }

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
        try {
          recipient = btcAddress.fromOutputScript(out.script, net)
        } catch (_) {}

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
   * Build a fee-aware funding plan.
   *
   * Uses `descriptors` + `coinselect` to choose inputs, at a given feeRate (sats/vB). Returns the selected UTXOs (in the shape expected by the PSBT builder), the computed fee, and the resulting change value.
   *
   * @protected
   * @param {Object} params
   * @param {string} params.fromAddress - The sender's address.
   * @param {string} params.toAddress - The recipient's address.
   * @param {number} params.amount - Amount to send in sats.
   * @param {number} params.feeRate - Fee rate in sats/vB.
   * @returns {Promise<{ utxos: Array<any>, fee: number, changeValue: number }>}
   * utxos: [{ tx_hash, tx_pos, value, vout: { value, scriptPubKey: { hex } } }, ...]
   * fee: total fee in sats chosen by coinselect
   * changeValue: total inputs - amount - fee (sats)
   */
  async _planSpend ({ fromAddress, toAddress, amount, feeRate }) {
    if (amount <= DUST_LIMIT) {
      throw new Error(`The amount must be bigger than the dust limit (= ${DUST_LIMIT}).`)
    }

    const net = this._network

    const ownScriptHex = btcAddress.toOutputScript(fromAddress, net).toString('hex')

    const ownOutput = new Output({ descriptor: `addr(${fromAddress})`, network: net })
    const toOutput = new Output({ descriptor: `addr(${toAddress})`, network: net })

    const unspent = await this._electrumClient.blockchainScripthash_listunspent(this._getScriptHash(fromAddress))
    if (!unspent || unspent.length === 0) {
      throw new Error('No unspent outputs available.')
    }

    const utxosForSelect = unspent.map(u => ({ output: ownOutput, value: u.value, __ref: u }))
    const satsPerVb = Math.max(Number(feeRate) || 0, 1)

    const result = coinselect({
      utxos: utxosForSelect,
      targets: [{ output: toOutput, value: amount }],
      remainder: ownOutput,
      feeRate: satsPerVb
    })

    if (!result) {
      throw new Error('Insufficient balance to send the transaction.')
    }

    let fee = Number.isFinite(result.fee) && result.fee > 0 ? result.fee : MIN_TX_FEE_SATS
    fee = Math.max(fee, MIN_TX_FEE_SATS)

    const utxos = result.utxos.map(u => {
      const base = u.__ref
      return {
        ...base,
        vout: { value: base.value, scriptPubKey: { hex: ownScriptHex } }
      }
    })

    const totalIn = utxos.reduce((s, u) => s + u.value, 0)

    let changeValue = totalIn - amount - fee
    if (changeValue < 0) throw new Error('Insufficient balance after fees.')
    if (changeValue <= DUST_LIMIT) {
      fee += Math.max(changeValue, 0)
      changeValue = 0
    }
    return { utxos, fee, changeValue }
  }

  _getScriptHash (address) {
    const script = btcAddress.toOutputScript(address, this._network)
    const hash = btcCrypto.sha256(script)
    return Buffer.from(hash).reverse().toString('hex')
  }
}
