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

const MEMPOOL_SPACE_URL = 'https://mempool.space'

/**
 * Sums the amount leaving an address through its unconfirmed transactions.
 *
 * @param {Array<Object>} [transactions] - Transactions returned for the address.
 * @param {string} address - The bitcoin address.
 * @returns {number} Unconfirmed outgoing amount in satoshis.
 */
function getUnconfirmedOutgoing (transactions, address) {
  const pendingTxs = (transactions || []).filter(tx => tx.blockHeight === -1)
  const pendingTxids = new Set(pendingTxs.map(tx => tx.txid))
  const pendingTxsById = new Map(pendingTxs.map(tx => [tx.txid, tx]))

  const rootedTxMap = new Map()

  // A tx only counts if its money traces back to confirmed funds - directly,
  // or by spending another pending tx that is itself rooted. A tx built
  // entirely from other unconfirmed deposits (nothing rooted upstream) is
  // ignored, since none of that value was ever part of the confirmed balance.
  function isRooted (tx) {
    if (rootedTxMap.has(tx.txid)) return rootedTxMap.get(tx.txid)

    // Assume unrooted while resolving, to guard against any (invalid) cycle.
    rootedTxMap.set(tx.txid, false)

    const ownedVins = (tx.vin || []).filter(entry => entry.isAddress && entry.addresses?.includes(address))

    const rooted = ownedVins.some(vin => {
      if (!pendingTxids.has(vin.txid)) return true // spends an already-confirmed output

      const parent = pendingTxsById.get(vin.txid)
      return isRooted(parent)
    })

    rootedTxMap.set(tx.txid, rooted)
    return rooted
  }

  const rootedTxs = pendingTxs.filter(isRooted)

  // Track every pending output that gets spent further by another rooted tx,
  // so it's excluded from change below - only the final, unspent tip of a
  // chain should count as change, not an intermediate hop.
  const consumedOutpoints = new Set()
  for (const tx of rootedTxs) {
    for (const vin of tx.vin || []) {
      if (pendingTxids.has(vin.txid)) consumedOutpoints.add(`${vin.txid}:${vin.vout}`)
    }
  }

  return rootedTxs.reduce((total, tx) => {
    // Exclude inputs that spend another pending tx's output - that value is
    // already accounted for by whichever tx produced it (or was never real,
    // if that tx isn't rooted).
    const vin = (tx.vin || []).filter(entry => !pendingTxids.has(entry.txid))
    const spent = sumOwnedValues(vin, address)

    const vout = (tx.vout || []).filter(entry => !consumedOutpoints.has(`${tx.txid}:${entry.n}`))
    const change = sumOwnedValues(vout, address)

    return total + (spent - change)
  }, 0)
}

/**
 * @param {Array<Object>} [entries] - Transaction vin or vout entries.
 * @param {string} address - The bitcoin address.
 * @returns {number} Sum of entry values belonging to the address.
 */
function sumOwnedValues (entries, address) {
  return (entries || [])
    .filter(entry => entry.isAddress && entry.addresses?.includes(address))
    .reduce((total, entry) => total + Number(entry.value), 0)
}

/**
 * @typedef {Object} BlockbookClientConfig
 * @property {string} url - The Blockbook server API base URL (e.g., 'https://btc1.trezor.io/api').
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
   * Establishes the connection to the server.
   * Blockbook is a stateless REST API, so clients don't need to call this method.
   *
   * @returns {Promise<void>}
   */
  async connect () {}

  /**
   * Closes the connection.
   * Blockbook is a stateless REST API, so this is a no-op.
   *
   * @returns {Promise<void>}
   */
  async close () {}

  /**
   * Recreates the underlying socket and reinitializes the session.
   * Blockbook is a stateless REST API, so this is a no-op.
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
    const data = await this._get(`/v2/address/${address}?details=txs`)

    const unconfirmedOutgoing = getUnconfirmedOutgoing(data.transactions, address)

    return {
      confirmed: Number(data.balance),
      unconfirmed: Number(data.unconfirmedBalance),
      unconfirmedOutgoing
    }
  }

  /**
   * Returns unspent transaction outputs for an address.
   *
   * @param {string} address - The bitcoin address.
   * @returns {Promise<BtcUtxo[]>} List of UTXOs.
   */
  async listUnspent (address) {
    const data = await this._get(`/v2/utxo/${address}`)

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
      const data = await this._get(`/v2/address/${address}?details=txslight&pageSize=1000&page=${page}`)
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
    const data = await this._get(`/v2/tx/${txHash}`)

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
    const data = await this._get(`/v2/sendtx/${rawTx}`)

    if (data.error) {
      throw new Error(data.error)
    }

    return data.result
  }

  /**
   * Returns the estimated fee rate.
   *
   * Tries the Blockbook v1 fee estimation endpoint first. If that fails,
   * falls back to mempool.space.
   *
   * @param {number} blocks - The confirmation target in blocks.
   * @returns {Promise<number>} Fee rate in BTC/kB.
   * @throws {Error} If fee estimation is unavailable from both sources.
   */
  async estimateFee (blocks) {
    const blockbookRate = await this._estimateFeeFromBlockbook(blocks)
    if (blockbookRate !== null) return blockbookRate

    return this._estimateFeeFromMempool(blocks)
  }

  /**
   * @private
   * @param {number} blocks
   * @returns {Promise<number | null>} Fee rate in BTC/kB, or null if unavailable.
   */
  async _estimateFeeFromBlockbook (blocks) {
    try {
      const data = await this._get(`/v1/estimatefee/${blocks}`)
      const rate = Number(data.result ?? data)
      if (rate > 0) return rate
      return null
    } catch {
      return null
    }
  }

  /**
   * @private
   * @param {number} blocks
   * @returns {Promise<number>} Fee rate in BTC/kB.
   * @throws {Error} If fee estimation is unavailable.
   */
  async _estimateFeeFromMempool (blocks) {
    const response = await fetch(`${MEMPOOL_SPACE_URL}/api/v1/fees/recommended`)

    if (!response.ok) {
      throw new Error('Fee estimation request failed')
    }

    const data = await response.json()

    let satPerVB
    if (blocks <= 1) satPerVB = data.fastestFee
    else if (blocks <= 3) satPerVB = data.halfHourFee
    else if (blocks <= 6) satPerVB = data.hourFee
    else satPerVB = data.economyFee

    if (!satPerVB || satPerVB <= 0) {
      throw new Error('Fee estimation is unavailable')
    }

    return satPerVB / 100_000
  }

  /** @private */
  async _get (path) {
    const url = `${this._baseUrl}${path}`
    const response = await fetch(url)

    if (!response.ok) {
      const text = await response.text().catch(() => 'Failed to read response body')
      throw new Error(`Blockbook request failed: ${response.status} ${response.statusText} – ${text}`)
    }

    return response.json()
  }
}
