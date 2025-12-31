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

/**
 * @typedef {Object} MempoolElectrumConfig
 * @property {string} host - The Electrum server hostname.
 * @property {number} port - The Electrum server port.
 * @property {'tcp' | 'ssl' | 'tls'} [protocol] - The transport protocol (default: 'tcp').
 * @property {number} [maxRetry] - Maximum reconnection attempts (default: 2).
 * @property {number} [retryPeriod] - Delay between reconnection attempts in milliseconds (default: 1000).
 * @property {number} [pingPeriod] - Delay between keep-alive pings in milliseconds (default: 120000).
 * @property {(err: Error | null) => void} [callback] - Called when all retries are exhausted.
 */

/** @typedef {import('./electrum-client.js').default} IElectrumClient */
/** @typedef {import('./electrum-client.js').ElectrumBalance} ElectrumBalance */
/** @typedef {import('./electrum-client.js').ElectrumUtxo} ElectrumUtxo */
/** @typedef {import('./electrum-client.js').ElectrumHistoryItem} ElectrumHistoryItem */

/**
 * Electrum client using @mempool/electrum-client.
 *
 * @implements {IElectrumClient}
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
      maxRetry = 2,
      retryPeriod = 1_000,
      pingPeriod = 120_000,
      callback = null
    } = config

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
   * Returns the balance for a script hash.
   *
   * @param {string} scripthash - The script hash.
   * @returns {Promise<ElectrumBalance>} The balance information.
   * @see https://electrum.readthedocs.io/en/latest/protocol.html#blockchain-address-get-balance
   */
  async getBalance (scripthash) {
    return this._client.blockchainScripthash_getBalance(scripthash)
  }

  /**
   * Returns unspent transaction outputs for a script hash.
   *
   * @param {string} scripthash - The script hash.
   * @returns {Promise<ElectrumUtxo[]>} List of UTXOs.
   * @see https://electrum.readthedocs.io/en/latest/protocol.html#blockchain-address-listunspent
   */
  async listUnspent (scripthash) {
    return this._client.blockchainScripthash_listunspent(scripthash)
  }

  /**
   * Returns transaction history for a script hash.
   *
   * @param {string} scripthash - The script hash.
   * @returns {Promise<ElectrumHistoryItem[]>} List of transactions.
   * @see https://electrum.readthedocs.io/en/latest/protocol.html#blockchain-address-get-history
   */
  async getHistory (scripthash) {
    return this._client.blockchainScripthash_getHistory(scripthash)
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
   * @see https://electrum.readthedocs.io/en/latest/protocol.html#blockchain-estimatefee
   */
  async estimateFee (blocks) {
    return this._client.blockchainEstimatefee(blocks)
  }
}
