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

import MempoolClient from '@mempool/electrum-client'
import { address as btcAddress, crypto, networks } from 'bitcoinjs-lib'

/**
 * @typedef {Object} MempoolElectrumConfig
 * @property {string} host - The Electrum server hostname.
 * @property {number} port - The Electrum server port.
 * @property {'tcp' | 'ssl' | 'tls'} [protocol] - The transport protocol (default: 'tcp').
 * @property {"bitcoin" | "regtest" | "testnet"} [network] - The network name (default: 'bitcoin').
 * @property {number} [maxRetry] - Maximum reconnection attempts (default: 2).
 * @property {number} [retryPeriod] - Delay between reconnection attempts in milliseconds (default: 1000).
 * @property {number} [pingPeriod] - Delay between keep-alive pings in milliseconds (default: 120000).
 * @property {(err: Error | null) => void} [callback] - Called when all retries are exhausted.
 */

/** @typedef {import('./btc-client.js').default} IBtcClient */
/** @typedef {import('./btc-client.js').BtcBalance} BtcBalance */
/** @typedef {import('./btc-client.js').BtcUtxo} BtcUtxo */
/** @typedef {import('./btc-client.js').BtcHistoryItem} BtcHistoryItem */

/**
 * Electrum client using @mempool/electrum-client.
 *
 * @implements {IBtcClient}
 */
export default class MempoolElectrumClient {
  /**
   * Creates a new Mempool Electrum client.
   *
   * @param {MempoolElectrumConfig} config - Configuration options.
   */
  constructor (config) {
    const {
      host,
      port,
      protocol = 'tcp',
      network = 'bitcoin',
      maxRetry = 2,
      retryPeriod = 1_000,
      pingPeriod = 120_000,
      callback = null
    } = config

    /** @private */
    this._network = networks[network]

    /**
     * @private
     * @type {MempoolClient}
     */
    this._client = new MempoolClient(port, host, protocol)

    /**
     * @private
     * @type {{ client: string, version: string }}
     */
    this._electrumConfig = {
      client: '@tetherto/wdk-wallet-btc',
      version: '1.4'
    }

    /**
     * @private
     * @type {{ maxRetry: number, retryPeriod: number, pingPeriod: number, callback: ((err: Error | null) => void) | null }}
     */
    this._persistencePolicy = { maxRetry, retryPeriod, pingPeriod, callback }

    /**
     * @private
     * @type {boolean}
     */
    this._connected = false

    /**
     * @private
     * @type {Promise<void> | null}
     */
    this._connecting = null
  }

  /**
   * Establishes the connection to the Electrum server.
   *
   * @returns {Promise<void>}
   */
  connect () {
    if (this._connected) return Promise.resolve()
    if (this._connecting) return this._connecting

    this._connecting = this._client
      .initElectrum(this._electrumConfig, this._persistencePolicy)
      .then(() => {
        this._connected = true
      })
      .finally(() => {
        this._connecting = null
      })

    return this._connecting
  }

  /**
   * Closes the connection.
   *
   * @returns {Promise<void>}
   */
  async close () {
    this._client.close()
    this._connected = false
    this._connecting = null
  }

  /**
   * Recreates the underlying socket and reinitializes the session.
   *
   * @returns {Promise<void>}
   */
  async reconnect () {
    this._connected = false
    this._connecting = null
    this._client.initSocket()
    await this.connect()
  }

  /**
   * Returns the balance for an address.
   *
   * @param {string} address - The bitcoin address.
   * @returns {Promise<BtcBalance>} The balance information.
   */
  async getBalance (address) {
    return this._client.blockchainScripthash_getBalance(this._toScriptHash(address))
  }

  /**
   * Returns unspent transaction outputs for an address.
   *
   * @param {string} address - The bitcoin address.
   * @returns {Promise<BtcUtxo[]>} List of UTXOs.
   */
  async listUnspent (address) {
    return this._client.blockchainScripthash_listunspent(this._toScriptHash(address))
  }

  /**
   * Returns transaction history for an address.
   *
   * @param {string} address - The bitcoin address.
   * @returns {Promise<BtcHistoryItem[]>} List of transactions.
   */
  async getHistory (address) {
    return this._client.blockchainScripthash_getHistory(this._toScriptHash(address))
  }

  /**
   * Returns a raw transaction.
   *
   * @param {string} txHash - The transaction hash.
   * @returns {Promise<string>} Hex-encoded raw transaction.
   * @see https://electrum.readthedocs.io/en/latest/protocol.html#blockchain-transaction-get
   */
  async getTransaction (txHash) {
    return this._client.blockchainTransaction_get(txHash)
  }

  /**
   * Broadcasts a raw transaction to the network.
   *
   * @param {string} rawTx - The raw transaction hex.
   * @returns {Promise<string>} Transaction hash if successful.
   * @see https://electrum.readthedocs.io/en/latest/protocol.html#blockchain-transaction-broadcast
   */
  async broadcast (rawTx) {
    return this._client.blockchainTransaction_broadcast(rawTx)
  }

  /**
   * Returns the estimated fee rate.
   *
   * @param {number} blocks - The confirmation target in blocks.
   * @returns {Promise<number>} Fee rate in BTC/kB.
   * @throws {Error} If fee estimation is unavailable.
   * @see https://electrum.readthedocs.io/en/latest/protocol.html#blockchain-estimatefee
   */
  async estimateFee (blocks) {
    const rate = await this._client.blockchainEstimatefee(blocks)
    if (rate === -1) throw new Error('Fee estimation is unavailable')
    return rate
  }

  /** @private */
  _toScriptHash (address) {
    const script = btcAddress.toOutputScript(address, this._network)
    const hash = crypto.sha256(script)
    return Buffer.from(hash).reverse().toString('hex')
  }
}
