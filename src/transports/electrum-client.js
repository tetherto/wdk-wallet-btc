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

/**
 * Abstract base class for Electrum clients.
 *
 * Provides lazy initialization via a Proxy. The connection is established automatically
 * on the first RPC call.
 *
 * @abstract
 */
export default class ElectrumClient {
  /**
   * Creates a new ElectrumClient instance.
   *
   * @param {number} [timeout=15000] - Connection timeout in milliseconds.
   */
  constructor (timeout = 15_000) {
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
   * Recreates the underlying socket and reinitializes the session.
   *
   * @abstract
   * @returns {Promise<void>}
   */
  reconnect () {
    throw new NotImplementedError('reconnect()')
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

  /**
   * Returns the balance for a script hash.
   *
   * @param {string} scripthash - The script hash.
   * @returns {Promise<{ confirmed: number }>} Confirmed balance in satoshis.
   */
  getBalance (scripthash) {
    throw new NotImplementedError('getBalance(scripthash)')
  }

  /**
   * Returns unspent transaction outputs for a script hash.
   *
   * @param {string} scripthash - The script hash.
   * @returns {Promise<Array<{ tx_hash: string, tx_pos: number, value: number }>>} List of UTXOs.
   */
  listUnspent (scripthash) {
    throw new NotImplementedError('listUnspent(scripthash)')
  }

  /**
   * Returns transaction history for a script hash.
   *
   * @param {string} scripthash - The script hash.
   * @returns {Promise<Array<{ tx_hash: string, height: number }>>} List of transactions.
   */
  getHistory (scripthash) {
    throw new NotImplementedError('getHistory(scripthash)')
  }

  /**
   * Returns a raw transaction.
   *
   * @param {string} txHash - The transaction hash.
   * @returns {Promise<string>} Hex-encoded raw transaction.
   */
  getTransaction (txHash) {
    throw new NotImplementedError('getTransaction(txHash)')
  }

  /**
   * Broadcasts a raw transaction to the network.
   *
   * @param {string} rawTx - The raw transaction hex.
   * @returns {Promise<string>} Transaction hash if successful.
   */
  broadcast (rawTx) {
    throw new NotImplementedError('broadcast(rawTx)')
  }

  /**
   * Returns the estimated fee rate.
   *
   * @param {number} blocks - The confirmation target in blocks.
   * @returns {Promise<number>} Fee rate in BTC/kB.
   */
  estimateFee (blocks) {
    throw new NotImplementedError('estimateFee(blocks)')
  }
}