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

import { ProviderError, ProviderErrorReason } from '@tetherto/wdk-wallet'

import MempoolClient from '@mempool/electrum-client'
import { networks } from 'bitcoinjs-lib'
import * as tls from 'node:tls'
import { toScriptHash } from './btc-client.js'

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

const CERTIFICATE_ERROR_CODES = new Set([
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
])

function isCertificateError (error) {
  return CERTIFICATE_ERROR_CODES.has(error?.code) || /certificate/i.test(error?.message || '')
}

function createSecureTlsModule (host) {
  return {
    connect (options, callback) {
      return tls.connect({
        ...options,
        rejectUnauthorized: true,
        servername: host
      }, callback)
    }
  }
}

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
    this._host = host

    /** @private */
    this._protocol = protocol

    /** @private */
    this._network = networks[network]

    /**
     * @private
     * @type {MempoolClient}
     */
    this._client = new MempoolClient(port, host, protocol)

    if (protocol === 'tls' || protocol === 'ssl') {
      const secureTls = createSecureTlsModule(host)
      const initSocket = this._client.initSocket.bind(this._client)

      // @mempool/electrum-client@1.1.9 hardcodes rejectUnauthorized: false
      // in its private TLS wrapper. Keep the replacement scoped to this client.
      const initSecureSocket = (...args) => {
        initSocket(...args)
        this._client.conn._tls = secureTls
      }

      this._client.initSocket = initSecureSocket
      this._client.conn._tls = secureTls
    }

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
      .catch(error => {
        if (this._protocol !== 'tls' && this._protocol !== 'ssl') throw error

        const detail = error instanceof Error ? error.message : String(error)
        const message = isCertificateError(error)
          ? `TLS certificate rejected for ${this._host}: ${detail}`
          : `TLS connection to ${this._host} failed: ${detail}`

        throw new ProviderError(message, {
          reason: ProviderErrorReason.NETWORK_ERROR
        })
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
    return this._client.blockchainScripthash_getBalance(toScriptHash(address, this._network))
  }

  /**
   * Returns unspent transaction outputs for an address.
   *
   * @param {string} address - The bitcoin address.
   * @returns {Promise<BtcUtxo[]>} List of UTXOs.
   */
  async listUnspent (address) {
    return this._client.blockchainScripthash_listunspent(toScriptHash(address, this._network))
  }

  /**
   * Returns transaction history for an address.
   *
   * @param {string} address - The bitcoin address.
   * @returns {Promise<BtcHistoryItem[]>} List of transactions.
   */
  async getHistory (address) {
    return this._client.blockchainScripthash_getHistory(toScriptHash(address, this._network))
  }

  /**
   * Returns the height of the current best block.
   *
   * @returns {Promise<number>} The current block height.
   */
  async getBlockHeight () {
    const header = await this._client.blockchainHeaders_subscribe()
    return header.height
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
   * @throws {ProviderError} If fee estimation is unavailable.
   * @see https://electrum.readthedocs.io/en/latest/protocol.html#blockchain-estimatefee
   */
  async estimateFee (blocks) {
    const rate = await this._client.blockchainEstimatefee(blocks)
    if (rate === -1) {
      throw new ProviderError('Fee estimation is unavailable', {
        reason: ProviderErrorReason.INTERNAL_SERVER_ERROR
      })
    }
    return rate
  }
}
