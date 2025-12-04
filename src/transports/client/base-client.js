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

import { NotImplementedError } from '@tetherto/wdk-wallet'

import IElectrumClient from './electrum-client.js'

/**
 * Abstract base class for Electrum clients.
 *
 * Provides lazy initialization via a Proxy. The connection is established automatically
 * on the first RPC call.
 *
 * @abstract
 * @extends IElectrumClient
 */
export default class BaseClient extends IElectrumClient {
  /**
   * Creates a new BaseClient instance.
   *
   * @param {number} [timeout=15000] - Connection timeout in milliseconds.
   */
  constructor (timeout = 15_000) {
    super()

    /**
     * @protected
     * @type {number}
     */
    this._timeout = timeout

    /**
     * @protected
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

        if (prop === 'close' || prop === '_connect' || prop === 'reconnect') {
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
   * Ensures the electrum connection is initialized.
   *
   * @private
   * @returns {Promise<void>}
   */
  _ensure () {
    if (this._ready) {
      return this._ready
    }

    const connectPromise = this._connect()

    const timeoutPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Electrum client connection timed out.')), this._timeout)
      timer.unref()
    })

    this._ready = Promise.race([connectPromise, timeoutPromise]).catch(error => {
      this._ready = null
      throw error
    })

    return this._ready
  }

  /**
   * Establishes the connection to the Electrum server.
   *
   * @protected
   * @abstract
   * @returns {Promise<void>}
   */
  async _connect () {
    throw new NotImplementedError('_connect()')
  }

  /**
   * Closes the underlying connection.
   *
   * @protected
   * @abstract
   * @returns {void}
   */
  _close () {
    throw new NotImplementedError('_close()')
  }

  /**
   * Closes the connection.
   *
   * @returns {void}
   */
  close () {
    this._close()
    this._ready = null
  }
}