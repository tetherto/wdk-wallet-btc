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

import { connect as _netConnect } from 'net'
import { connect as __tlsConnect } from 'tls'
import { networks, address as _address, crypto } from 'bitcoinjs-lib'
import BigNumber from 'bignumber.js'

export default class ElectrumClient {
  constructor (config = {}) {
    this._network = networks[config.network || 'bitcoin']
    if (!this._network) {
      throw new Error(`Invalid network: ${config.network}.`)
    }
    this._host = config.host || 'electrum.blockstream.info'
    this._port = config.port || 50001
    this._protocol = config.protocol || 'tcp'

    this._socket = null
    this._connected = false
    this._pendingRequests = new Map()
  }

  get network () {
    return this._network
  }

  connect () {
    return new Promise((resolve, reject) => {
      try {
        const socketOptions = {
          port: this._port,
          host: this._host,
          reuseAddress: true,
          noDelay: true,
          keepAlive: true,
          keepAliveInitialDelay: 60000
        }

        const socket = this._protocol === 'tcp'
          ? _netConnect(socketOptions)
          : __tlsConnect(socketOptions)

        socket.setTimeout(30000)
        socket.on('timeout', () => {
          socket.destroy()
          this._connected = false
          reject(new Error('Electrum client connection time-out.'))
        })

        socket.on('connect', () => {
          this._socket = socket
          this._connected = true
          this._setupSocket()
          resolve()
        })

        socket.on('error', (error) => {
          this._connected = false
          if (this._socket) {
            this._socket.destroy()
            this._socket = null
          }
          reject(error)
        })

        socket.on('close', () => {
          this._connected = false
          this._socket = null
          this._pendingRequests.clear()
        })

        socket.on('end', () => {
          this._connected = false
          this._socket = null
        })
      } catch (error) {
        this._connected = false
        if (this._socket) {
          this._socket.destroy()
          this._socket = null
        }
        reject(error)
      }
    })
  }

  _setupSocket () {
    let buffer = ''
    this._socket.on('data', (data) => {
      buffer += data.toString()
      while (true) {
        const newlineIndex = buffer.indexOf('\n')
        if (newlineIndex === -1) break
        const line = buffer.slice(0, newlineIndex)
        buffer = buffer.slice(newlineIndex + 1)
        try {
          const response = JSON.parse(line)
          this._handleResponse(response)
        } catch (error) {
          console.error('Failed to parse response:', error)
        }
      }
    })
  }

  _handleResponse (response) {
    if (response.id && this._pendingRequests.has(response.id)) {
      const { resolve, reject } = this._pendingRequests.get(response.id)
      this._pendingRequests.delete(response.id)
      if (response.error) {
        reject(new Error(response.error.message))
      } else {
        resolve(response.result)
      }
    }
  }

  async disconnect () {
    return new Promise((resolve) => {
      if (this._socket && this._connected) {
        this._socket.once('close', () => {
          this._connected = false
          this._socket = null
          this._pendingRequests.clear()
          resolve()
        })
        try {
          this._socket.end()
        } catch (error) {
          this._socket.destroy()
          this._socket = null
          this._connected = false
          this._pendingRequests.clear()
          resolve()
        }
      } else {
        resolve()
      }
    })
  }

  async _request (method, params = [], retries = 2) {
    if (!this.isConnected()) {
      try {
        await this.connect()
      } catch (connectError) {
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000))
          return this._request(method, params, retries - 1)
        }
        throw new Error(`Failed to connect after retries: ${connectError.message}.`)
      }
    }

    return new Promise((resolve, reject) => {
      const id = Math.floor(Math.random() * 1000000)
      const request = { id, method, params }
      const timeoutId = setTimeout(() => {
        this._pendingRequests.delete(id)
        reject(new Error('Electrum client request time-out.'))
      }, 30000)
      this._pendingRequests.set(id, {
        resolve: (result) => { clearTimeout(timeoutId); resolve(result) },
        reject: (error) => { clearTimeout(timeoutId); reject(error) }
      })
      try {
        if (!this._socket || !this._connected) {
          throw new Error('Electrum client websocket client not connected.')
        }
        this._socket.write(JSON.stringify(request) + '\n')
      } catch (error) {
        clearTimeout(timeoutId)
        this._pendingRequests.delete(id)
        reject(error)
      }
    })
  }

  async getHistory (address) {
    const scriptHash = this.getScriptHash(address)
    return await this._request('blockchain.scripthash.get_history', [scriptHash])
  }

  async getUnspent (address) {
    const scriptHash = this.getScriptHash(address)
    return await this._request('blockchain.scripthash.listunspent', [scriptHash])
  }

  async getTransaction (txid) {
    const tx = await this._request('blockchain.transaction.get', [txid, true])
    if (Array.isArray(tx.vout)) {
      tx.vout.forEach(vout => {
        if (typeof vout.value === 'number') {
          vout.value = new BigNumber(vout.value)
            .multipliedBy(1e8)
            .integerValue(BigNumber.ROUND_CEIL)
            .toNumber()
        }
      })
    }
    return tx
  }

  async broadcastTransaction (txHex) {
    return await this._request('blockchain.transaction.broadcast', [txHex])
  }

  async getFeeEstimate (blocks = 1) {
    const feeBtcPerKb = await this._request('blockchain.estimatefee', [blocks])
    return new BigNumber(feeBtcPerKb).multipliedBy(100_000).integerValue(BigNumber.ROUND_CEIL)
  }

  getScriptHash (address) {
    const script = _address.toOutputScript(address, this._network)
    const hash = crypto.sha256(script)
    return Buffer.from(hash).reverse().toString('hex')
  }

  async getBalance (address) {
    const scriptHash = this.getScriptHash(address)
    const result = await this._request('blockchain.scripthash.get_balance', [scriptHash])
    return result
  }

  async  getCurrentBlockHeight() {
    const header = await this._request('blockchain.headers.subscribe', []);
    return header.height;
  }
  isConnected () {
    return this._connected
  }
}
