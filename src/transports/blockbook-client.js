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
   * Creates a new Blockbook REST client.
   *
   * @param {BlockbookClientConfig} config - Configuration options.
   */
  constructor (config) {
    const { url } = config

    /**
     * @private
     * @type {string}
     */
    this._baseUrl = url.replace(/\/+$/, '')
  }

  /**
   * No-op — Blockbook is a stateless REST API.
   *
   * @returns {Promise<void>}
   */
  async connect () {}

  /**
   * No-op — Blockbook is a stateless REST API.
   *
   * @returns {Promise<void>}
   */
  async close () {}

  /**
   * No-op — Blockbook is a stateless REST API.
   *
   * @returns {Promise<void>}
   */
  async reconnect () {}

  /**
   * Returns the balance for an address.
   *
   * @param {string} address - The bitcoin address.
   * @returns {Promise<BtcBalance>} The balance information.
   */
  async getBalance (address) {
    const data = await this._get(`/api/v2/address/${address}?details=basic`)

    return {
      confirmed: Number(data.balance),
      unconfirmed: Number(data.unconfirmedBalance)
    }
  }

  /**
   * Returns unspent transaction outputs for an address.
   *
   * @param {string} address - The bitcoin address.
   * @returns {Promise<BtcUtxo[]>} List of UTXOs.
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
   * Returns transaction history for an address.
   *
   * @param {string} address - The bitcoin address.
   * @returns {Promise<BtcHistoryItem[]>} List of transactions.
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
   * Returns a raw transaction.
   *
   * @param {string} txHash - The transaction hash.
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
   * Broadcasts a raw transaction to the network.
   *
   * @param {string} rawTx - The raw transaction hex.
   * @returns {Promise<string>} Transaction hash if successful.
   */
  async broadcast (rawTx) {
    const data = await this._get(`/api/v2/sendtx/${rawTx}`)

    if (data.error) {
      throw new Error(data.error)
    }

    return data.result
  }

  /**
   * Not supported by BlockbookClient.
   *
   * @param {number} _blocks - The confirmation target in blocks.
   * @returns {Promise<number>}
   */
  async estimateFee (_blocks) {
    throw new Error("The 'estimateFee' method is not supported by BlockbookClient.")
  }

  /** @private */
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
