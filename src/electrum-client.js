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
  #network
  #host
  #port
  #protocol

  #socket
  #connected
  #pendingRequests

  constructor (config = {}) {
    this.#network = networks[config.network || 'bitcoin']

    if (!this.#network) {
      throw new Error(`Invalid network: ${config.network}.`)
    }

    this.#host = config.host || 'electrum.blockstream.info'
    this.#port = config.port || 50001
    this.#protocol = config.protocol || 'tcp'

    this.#socket = null
    this.#connected = false
    this.#pendingRequests = new Map()
  }

  get network () {
    return this.#network
  }

  connect () {
    return new Promise((resolve, reject) => {
      try {
        const socketOptions = {
          port: this.#port,
          host: this.#host,
          reuseAddress: true,
          noDelay: true,
          keepAlive: true,
          keepAliveInitialDelay: 60000
        }

        const socket = this.#protocol === 'tcp'
          ? _netConnect(socketOptions)
          : __tlsConnect(socketOptions)

        socket.setTimeout(30000)
        socket.on('timeout', () => {
          socket.destroy()
          this.#connected = false
          reject(new Error('Electrum client connection time-out.'))
        })

        socket.on('connect', () => {
          this.#socket = socket
          this.#connected = true
          this.#setupSocket()
          resolve()
        })

        socket.on('error', (error) => {
          this.#connected = false

          if (this.#socket) {
            this.#socket.destroy()
            this.#socket = null
          }
          reject(error)
        })

        socket.on('close', () => {
          this.#connected = false
          this.#socket = null

          this.#pendingRequests.clear()
        })

        socket.on('end', () => {
          this.#connected = false
          this.#socket = null
        })
      } catch (error) {
        this.#connected = false

        if (this.#socket) {
          this.#socket.destroy()
          this.#socket = null
        }
        reject(error)
      }
    })
  }

  #setupSocket () {
    let buffer = ''

    this.#socket.on('data', (data) => {
      buffer += data.toString()

      while (true) {
        const newlineIndex = buffer.indexOf('\n')
        if (newlineIndex === -1) break

        const line = buffer.slice(0, newlineIndex)
        buffer = buffer.slice(newlineIndex + 1)

        try {
          const response = JSON.parse(line)
          this.#handleResponse(response)
        } catch (error) {
          console.error('Failed to parse response:', error)
        }
      }
    })
  }

  #handleResponse (response) {
    if (response.id && this.#pendingRequests.has(response.id)) {
      const { resolve, reject } = this.#pendingRequests.get(response.id)
      this.#pendingRequests.delete(response.id)

      if (response.error) {
        reject(new Error(response.error.message))
      } else {
        resolve(response.result)
      }
    }
  }

  async disconnect () {
    return new Promise((resolve) => {
      if (this.#socket && this.#connected) {
        this.#socket.once('close', () => {
          this.#connected = false
          this.#socket = null
          this.#pendingRequests.clear()
          resolve()
        })

        try {
          this.#socket.end()
        } catch (error) {
          this.#socket.destroy()
          this.#socket = null
          this.#connected = false
          this.#pendingRequests.clear()
          resolve()
        }
      } else {
        resolve()
      }
    })
  }

  async #request (method, params = [], retries = 2) {
    if (!this.isConnected()) {
      try {
        await this.connect()
      } catch (connectError) {
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000))

          return this.#request(method, params, retries - 1)
        }
        throw new Error(`Failed to connect after retries: ${connectError.message}.`)
      }
    }

    return new Promise((resolve, reject) => {
      const id = Math.floor(Math.random() * 1000000)
      const request = {
        id,
        method,
        params
      }

      const timeoutId = setTimeout(() => {
        this.#pendingRequests.delete(id)
        reject(new Error('Electrum client request time-out.'))
      }, 30000)

      this.#pendingRequests.set(id, {
        resolve: (result) => {
          clearTimeout(timeoutId)
          resolve(result)
        },
        reject: (error) => {
          clearTimeout(timeoutId)
          reject(error)
        }
      })

      try {
        if (!this.#socket || !this.#connected) {
          throw new Error('Electrum client websocket client not connected.')
        }
        this.#socket.write(JSON.stringify(request) + '\n')
      } catch (error) {
        clearTimeout(timeoutId)
        this.#pendingRequests.delete(id)
        reject(error)
      }
    })
  }

  async getHistory (address) {
    const scriptHash = this.getScriptHash(address)
    return await this.#request('blockchain.scripthash.get_history', [scriptHash])
  }

  async getUnspent (address) {
    const scriptHash = this.getScriptHash(address)
    return await this.#request('blockchain.scripthash.listunspent', [scriptHash])
  }

  async getTransaction (txid) {
    const tx = await this.#request('blockchain.transaction.get', [txid, true])

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
    return await this.#request('blockchain.transaction.broadcast', [txHex])
  }

  async getFeeEstimate (blocks = 1) {
    const feeBtcPerKb = await this.#request('blockchain.estimatefee', [blocks])
    return new BigNumber(feeBtcPerKb).multipliedBy(100_000).integerValue(BigNumber.ROUND_CEIL)
  }

  getScriptHash (address) {
    const script = _address.toOutputScript(address, this.#network)
    const hash = crypto.sha256(script)
    return Buffer.from(hash).reverse().toString('hex')
  }

  async getBalance (address) {
    const scriptHash = this.getScriptHash(address)
    const result = await this.#request('blockchain.scripthash.get_balance', [scriptHash])
    return result
  }

  isConnected () {
    return this.#connected
  }
}