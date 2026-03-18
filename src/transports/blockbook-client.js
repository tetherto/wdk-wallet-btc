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

/** @typedef {import('./btc-client.js').default} IBtcClient */
/** @typedef {import('./btc-client.js').BtcBalance} BtcBalance */
/** @typedef {import('./btc-client.js').BtcUtxo} BtcUtxo */
/** @typedef {import('./btc-client.js').BtcHistoryItem} BtcHistoryItem */

/**
 * @typedef {Object} BlockbookClientConfig
 * @property {string} url - The Blockbook server base URL (e.g., 'https://btc1.trezor.io').
 */

/**
 * Stateless BTC client backed by the Blockbook v2 REST API.
 *
 * @implements {IBtcClient}
 */
export default class BlockbookClient {
  /**
   * @param {BlockbookClientConfig} config
   */
  constructor (config) {
    /** @private */
    this._baseUrl = config.url.replace(/\/+$/, '')
  }

  async connect () {}

  async close () {}

  async reconnect () {}

  /**
   * @param {string} address
   * @returns {Promise<BtcBalance>}
   */
  async getBalance (address) {
    const data = await this._get(`/api/v2/address/${address}?details=basic`)

    return {
      confirmed: Number(data.balance),
      unconfirmed: Number(data.unconfirmedBalance)
    }
  }

  /**
   * @param {string} address
   * @returns {Promise<BtcUtxo[]>}
   */
  async listUnspent (address) {
    const data = await this._get(`/api/v2/utxo/${address}`)

    return data.map(u => ({
      tx_hash: u.txid,
      tx_pos: u.vout,
      value: Number(u.value),
      height: u.height
    }))
  }

  /**
   * @param {string} address
   * @returns {Promise<BtcHistoryItem[]>}
   */
  async getHistory (address) {
    const items = []
    let page = 1

    while (true) {
      const data = await this._get(`/api/v2/address/${address}?details=txslight&pageSize=1000&page=${page}`)
      const txs = data.transactions || []

      for (const tx of txs) {
        items.push({
          tx_hash: tx.txid,
          height: tx.blockHeight
        })
      }

      if (page >= data.totalPages) break
      page++
    }

    return items
  }

  /**
   * @param {string} txHash
   * @returns {Promise<string>} Hex-encoded raw transaction.
   */
  async getTransaction (txHash) {
    const data = await this._get(`/api/v2/tx/${txHash}`)

    if (!data.hex) {
      throw new Error(`Transaction ${txHash} has no hex data`)
    }

    return data.hex
  }

  /**
   * @param {string} rawTx - Hex-encoded raw transaction.
   * @returns {Promise<string>} Transaction hash.
   */
  async broadcast (rawTx) {
    const data = await this._get(`/api/v2/sendtx/${rawTx}`)

    if (data.error) {
      throw new Error(data.error)
    }

    return data.result
  }

  /**
   * @param {number} _blocks
   * @returns {Promise<number>}
   */
  async estimateFee (_blocks) {
    throw new Error('estimateFee is not supported by BlockbookClient')
  }

  /**
   * @private
   * @param {string} path
   * @returns {Promise<any>}
   */
  async _get (path) {
    const url = `${this._baseUrl}${path}`
    const response = await fetch(url)

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Blockbook request failed: ${response.status} ${response.statusText} – ${text}`)
    }

    return response.json()
  }
}
