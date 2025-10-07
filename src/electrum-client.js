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

import MempoolElectrumClient from '@mempool/electrum-client'

/**
 * @typedef {Object} ElectrumConfig
 * @property {string} [client] - The name of the client reported to the server (default: 'wdk-wallet').
 * @property {string} [version] - The electrum protocol version (default: '1.4').
 */

/**
 * @typedef {Object} PersistencePolicy
 * @property {number} [maxRetry] - The maximum reconnection attempts before failing (default: 2).
 * @property {number} [retryPeriod] - The delay between reconnect attempts, in ms (default: 1_000).
 * @property {number} [pingPeriod] - The delay between keep-alive pings, in ms (default: 100_000).
 * @property {(err: Error | null) => void} [callback] - An optional status callback.
 */

/**
 * A thin wrapper around {@link @mempool/electrum-client} that lazily initializes the underlying
 * electrum connection on first rpc call.
 *
 * The instance returned from the constructor is a proxy that intercepts all method calls
 * except `close`, `initElectrum`, and `reconnect` and ensures the client is initialized.
 */
export default class ElectrumClient extends MempoolElectrumClient {
  /**
   * Create a new electrum client wrapper.
   *
   * @param {number} port - The electrum server's port.
   * @param {string} host - The electrum server's hostname.
   * @param {'tcp' | 'tls' | 'ssl'} protocol - The transport protocol to use.
   * @param {PersistencePolicy} [persistencePolicy] - The persistence policy.
   */
  constructor (port, host, protocol, persistencePolicy = { }) {
    super(port, host, protocol)

    const { retryPeriod = 1_000, maxRetry = 2, pingPeriod = 120_000, callback = null } = persistencePolicy

    /**
     * @private
     * @type {ElectrumConfig}
     **/
    this._electrumConfig = {
      client: '@tetherto/wdk-wallet-btc',
      version: '1.4'
    }

    /**
     * @private
     * @type {PersistencePolicy}
     **/
    this._persistencePolicy = { retryPeriod, maxRetry, pingPeriod, callback }

    /**
     * @private
     * @type {Promise<void> | null}
     */
    this._ready = null

    const _this = this

    return new Proxy(this, {
      get (target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver)

        if (typeof value !== 'function') {
          return value
        }

        if (prop === 'close' || prop === 'initElectrum' || prop === 'reconnect') {
          return value.bind(target)
        }

        return async function (...args) {
          await _this._ensure()
          return value.apply(target, args)
        }
      }
    })
  }

  /**
   * Ensures the electrum connection is initialized. If a previous attempt failed or the
   * client was closed, a new initialization is attempted.
   *
   * @private
   * @param {number} [timeout] - The timeout, in ms (default: 15_000).
   * @returns {Promise<void>}
   */
  _ensure (timeout = 15_000) {
    if (this._ready) {
      return this._ready
    }

    const initElectrum = super.initElectrum(this._electrumConfig, this._persistencePolicy)

    const timeoutTask = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Electrum client initialization time out.')), timeout)
      timer.unref()
    })

    this._ready = Promise.race([initElectrum, timeoutTask]).catch(error => {
      this._ready = null
      throw error
    })

    return this._ready
  }

  /**
   * Recreates the underlying socket and reinitializes the session.
   *
   * @returns {Promise<void>}
   */
  reconnect () {
    this.initSocket()

    const initElectrum = super.initElectrum(this._electrumConfig, this._persistencePolicy)

    this._ready = initElectrum.catch(error => {
      this._ready = null
      throw error
    })

    return this._ready
  }

  /**
   * Closes the connection.
   *
   * @returns {void}
   */
  close () {
    super.close()
    this._ready = null
    this.reconnect = ElectrumClient.prototype.reconnect.bind(this)
  }
}
