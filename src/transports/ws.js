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

import ElectrumClient from './client/base-client.js'

const isNode =
  typeof process !== 'undefined' &&
  !!(process.versions && process.versions.node)

const WS_SPEC = 'ws'
const WebSocket =
  globalThis.WebSocket ??
  (isNode ? (await import(/* @vite-ignore */ WS_SPEC)).default : undefined)
if (!WebSocket) {
  throw new Error('No WebSocket implementation available in this environment.')
}

/**
 * @typedef {Object} ElectrumWsConfig
 * @property {number} [timeout=15000] - Connection timeout in milliseconds.
 */

/**
 * Electrum client using WebSocket transport.
 *
 * Compatible with browser environments where TCP sockets are not available.
 * Requires an Electrum server that supports WebSocket connections.
 *
 * @extends ElectrumClient
 */
export default class ElectrumWs extends ElectrumClient {
  /**
   * Creates a new WebSocket Electrum client.
   *
   * @param {string} url - The WebSocket URL (e.g., 'wss://electrum.example.com:50004').
   * @param {ElectrumWsConfig} [config={}] - Configuration options.
   */
  constructor (url, config = {}) {
    const { timeout = 15_000 } = config

    super(timeout)

    /** @private */
    this._url = url

    /** @private */
    this._ws = null

    /** @private */
    this._requestId = 0

    /** @private */
    this._pending = new Map()
  }

  /** @protected */
  async _connect () {
    return new Promise((resolve, reject) => {
      this._ws = new WebSocket(this._url)

      this._ws.onopen = () => {
        resolve()
      }

      this._ws.onerror = (event) => {
        reject(new Error('WebSocket connection failed'))
      }

      this._ws.onclose = () => {
        // eslint-disable-next-line no-unused-vars
        for (const [_id, { reject }] of this._pending) {
          reject(new Error('WebSocket connection closed'))
        }
        this._pending.clear()
      }

      this._ws.onmessage = (event) => {
        this._handleMessage(event.data)
      }
    })
  }

  /** @private */
  _handleMessage (data) {
    let message

    try {
      message = JSON.parse(data)
    } catch (err) {
      console.error('Failed to parse Electrum response:', err)
      return
    }

    if (Array.isArray(message)) {
      for (const msg of message) {
        this._handleSingleMessage(msg)
      }
      return
    }

    this._handleSingleMessage(message)
  }

  /** @private */
  _handleSingleMessage (message) {
    const { id, result, error } = message

    if (id === undefined) {
      return
    }

    const pending = this._pending.get(id)

    if (!pending) {
      console.warn('Received response for unknown request:', id)
      return
    }

    this._pending.delete(id)

    if (error) {
      pending.reject(new Error(error.message || JSON.stringify(error)))
    } else {
      pending.resolve(result)
    }
  }

  /** @private */
  _request (method, params) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected')
    }

    const id = ++this._requestId

    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    }

    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject })
      this._ws.send(JSON.stringify(request))
    })
  }

  /** @protected */
  _close () {
    if (this._ws) {
      this._ws.close()
      this._ws = null
    }
    this._pending.clear()
  }

  reconnect () {
    this._close()
    this._ready = null
    return this._ensure()
  }

  getBalance (scripthash) {
    return this._request('blockchain.scripthash.get_balance', [scripthash])
  }

  listUnspent (scripthash) {
    return this._request('blockchain.scripthash.listunspent', [scripthash])
  }

  getHistory (scripthash) {
    return this._request('blockchain.scripthash.get_history', [scripthash])
  }

  getTransaction (txHash) {
    return this._request('blockchain.transaction.get', [txHash, false])
  }

  broadcast (rawTx) {
    return this._request('blockchain.transaction.broadcast', [rawTx])
  }

  estimateFee (blocks) {
    return this._request('blockchain.estimatefee', [blocks])
  }
}
