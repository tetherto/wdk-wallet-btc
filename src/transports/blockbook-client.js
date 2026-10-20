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

import { NoSuchElementError, ProviderError, ProviderErrorReason } from '@tetherto/wdk-wallet'

/** @typedef {import('./btc-client.js').default} IBtcClient */
/** @typedef {import('./btc-client.js').BtcBalance} BtcBalance */
/** @typedef {import('./btc-client.js').BtcHistoryItem} BtcHistoryItem */
/** @typedef {import('../primitives/index.js').ChainUtxo} ChainUtxo */

const MEMPOOL_SPACE_URL = 'https://mempool.space'

/**
 * Maps an http status code to the matching provider error reason.
 *
 * @param {number} status - The response's status code.
 * @returns {string} The provider error's reason.
 */
function toProviderErrorReason (status) {
  switch (status) {
    case 401:
      return ProviderErrorReason.UNAUTHORIZED
    case 403:
      return ProviderErrorReason.FORBIDDEN
    case 408:
    case 504:
      return ProviderErrorReason.REQUEST_TIMEOUT
    default:
      return status >= 500
        ? ProviderErrorReason.INTERNAL_SERVER_ERROR
        : ProviderErrorReason.NETWORK_ERROR
  }
}

/**
 * Sums the amount leaving an address through its unconfirmed transactions.
 *
 * Follows the same trust rule as Bitcoin Core's own wallet (see
 * `CachedTxIsTrusted` in https://github.com/bitcoin/bitcoin/blob/master/src/wallet/receive.cpp):
 * a pending transaction only counts if every one of its address-owned inputs
 * is either already confirmed, or itself spends another pending transaction
 * that is also trusted by this same rule. A transaction with even one
 * untrusted input (e.g. mixing in an unconfirmed deposit from elsewhere) gets
 * no credit for its own change until the whole chain resolves.
 *
 * @param {Array<Object>} [transactions] - Transactions returned for the address.
 * @param {string} address - The bitcoin address.
 * @returns {number} Unconfirmed outgoing amount in satoshis.
 */
function getUnconfirmedOutgoing (transactions, address) {
  const pendingTxs = (transactions || []).filter(tx => tx.blockHeight === -1)
  const pendingTxids = new Set(pendingTxs.map(tx => tx.txid))
  const pendingTxsById = new Map(pendingTxs.map(tx => [tx.txid, tx]))

  const trustedTxMap = new Map()

  // Matches Bitcoin Core's own wallet policy: a pending tx is only trusted if
  // every one of its inputs is address-owned (not just some of them - a tx
  // with even one input belonging to someone else, e.g. a shared or
  // multi-party transaction, is untrusted), and each is either already
  // confirmed or chained from another trusted tx. A tx with even one
  // untrusted input (e.g. mixing in an unconfirmed deposit from elsewhere)
  // gets no credit for its own change until the whole thing is trusted.
  function isTrusted (tx) {
    if (trustedTxMap.has(tx.txid)) return trustedTxMap.get(tx.txid)

    // Assume untrusted while resolving, to guard against any (invalid) cycle.
    trustedTxMap.set(tx.txid, false)

    const vins = tx.vin || []
    const ownedVins = vins.filter(entry => entry.isAddress && entry.addresses?.includes(address))

    const trusted = vins.length > 0 && ownedVins.length === vins.length && ownedVins.every(vin => {
      if (!pendingTxids.has(vin.txid)) return true // spends an already-confirmed output

      const parent = pendingTxsById.get(vin.txid)
      return isTrusted(parent)
    })

    trustedTxMap.set(tx.txid, trusted)
    return trusted
  }

  // Track every pending output that gets spent further by another tx, so
  // it's excluded from change below - only the final, unspent tip of a chain
  // should count as change, not an intermediate hop.
  const consumedOutpoints = new Set()
  for (const tx of pendingTxs) {
    for (const vin of tx.vin || []) {
      if (pendingTxids.has(vin.txid)) consumedOutpoints.add(`${vin.txid}:${vin.vout}`)
    }
  }

  return pendingTxs.reduce((total, tx) => {
    // Any input spending another pending tx's output is already accounted
    // for by whichever tx produced it - only a directly confirmed spend
    // counts here, regardless of whether this tx is trusted.
    const vin = (tx.vin || []).filter(entry => !pendingTxids.has(entry.txid))
    const spent = sumOwnedValues(vin, address)

    const vout = (tx.vout || []).filter(entry => !consumedOutpoints.has(`${tx.txid}:${entry.n}`))
    const change = isTrusted(tx) ? sumOwnedValues(vout, address) : 0

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
   * @returns {Promise<ChainUtxo[]>} List of UTXOs.
   */
  async listUnspent (address) {
    const data = await this._get(`/v2/utxo/${address}`)

    return data.map(u => ({
      outpoint: { txid: u.txid, vout: u.vout },
      value: BigInt(u.value),
      height: u.height ?? 0
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
   * Returns the height of the current best block.
   *
   * @returns {Promise<number>} The current block height.
   */
  async getBlockHeight () {
    const data = await this._get('/v2')
    return Number(data.blockbook?.bestHeight ?? data.backend?.blocks)
  }

  /**
   * Returns a raw transaction.
   *
   * @param {string} txHash - The transaction hash.
   * @returns {Promise<string>} Hex-encoded raw transaction.
   * @throws {NoSuchElementError} If the backend returns no raw transaction for the given hash.
   */
  async getTransaction (txHash) {
    const data = await this._get(`/v2/tx/${txHash}`)

    if (!data.hex) {
      throw new NoSuchElementError(`Transaction ${txHash} has no hex data`)
    }

    return data.hex
  }

  /**
   * Broadcasts a raw transaction to the network.
   *
   * @param {string} rawTx - The raw transaction hex.
   * @returns {Promise<string>} Transaction hash if successful.
   * @throws {ProviderError} If the backend rejects the transaction.
   */
  async broadcast (rawTx) {
    const data = await this._get(`/v2/sendtx/${rawTx}`)

    if (data.error) {
      throw new ProviderError(data.error, {
        reason: ProviderErrorReason.INTERNAL_SERVER_ERROR
      })
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
   * @throws {ProviderError} If fee estimation is unavailable from both sources.
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
   * @throws {ProviderError} If fee estimation is unavailable.
   */
  async _estimateFeeFromMempool (blocks) {
    const response = await fetch(`${MEMPOOL_SPACE_URL}/api/v1/fees/recommended`)

    if (!response.ok) {
      throw new ProviderError('Fee estimation request failed', {
        reason: toProviderErrorReason(response.status)
      })
    }

    const data = await response.json()

    let satPerVB
    if (blocks <= 1) satPerVB = data.fastestFee
    else if (blocks <= 3) satPerVB = data.halfHourFee
    else if (blocks <= 6) satPerVB = data.hourFee
    else satPerVB = data.economyFee

    if (!satPerVB || satPerVB <= 0) {
      throw new ProviderError('Fee estimation is unavailable', {
        reason: ProviderErrorReason.INTERNAL_SERVER_ERROR
      })
    }

    return satPerVB / 100_000
  }

  /** @private */
  async _get (path) {
    const url = `${this._baseUrl}${path}`
    const response = await fetch(url)

    if (!response.ok) {
      const text = await response.text().catch(() => 'Failed to read response body')
      throw new ProviderError(`Blockbook request failed: ${response.status} ${response.statusText} – ${text}`, {
        reason: toProviderErrorReason(response.status)
      })
    }

    return response.json()
  }
}
