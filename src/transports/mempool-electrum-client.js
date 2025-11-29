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
import ElectrumClient from './electrum-client.js'

/**
 * @typedef {Object} MempoolElectrumConfig
 * @property {number} [timeout=15000] - Connection timeout in milliseconds.
 * @property {number} [maxRetry=2] - Maximum reconnection attempts.
 * @property {number} [retryPeriod=1000] - Delay between reconnection attempts in milliseconds.
 * @property {number} [pingPeriod=120000] - Delay between keep-alive pings in milliseconds.
 * @property {(err: Error | null) => void} [callback] - Called when all retries are exhausted.
 */

/**
 * Electrum client using @mempool/electrum-client.
 *
 * @extends ElectrumClient
 */
export default class MempoolElectrumClient extends ElectrumClient {
  /**
   * Creates a new Mempool Electrum client.
   *
   * @param {number} port - The Electrum server port.
   * @param {string} host - The Electrum server hostname.
   * @param {'tcp' | 'ssl' | 'tls'} protocol - The transport protocol.
   * @param {MempoolElectrumConfig} [config={}] - Configuration options.
   */
  constructor (port, host, protocol, config = {}) {
    const { timeout = 15_000 } = config

    super(timeout)

    const {
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
  }

  /** @protected */
  async _connect () {
    await this._client.initElectrum(this._electrumConfig, this._persistencePolicy)
  }

  /** @protected */
  _close () {
    this._client.close()
  }

  reconnect () {
    this._client.initSocket()

    const initElectrum = this._client.initElectrum(this._electrumConfig, this._persistencePolicy)

    this._ready = initElectrum.catch(error => {
      this._ready = null
      throw error
    })

    return this._ready
  }

  getBalance (scripthash) {
    return this._client.blockchainScripthash_getBalance(scripthash)
  }

  listUnspent (scripthash) {
    return this._client.blockchainScripthash_listunspent(scripthash)
  }

  getHistory (scripthash) {
    return this._client.blockchainScripthash_getHistory(scripthash)
  }

  getTransaction (txHash) {
    return this._client.blockchainTransaction_get(txHash)
  }

  broadcast (rawTx) {
    return this._client.blockchainTransaction_broadcast(rawTx)
  }

  estimateFee (blocks) {
    return this._client.blockchainEstimatefee(blocks)
  }
}