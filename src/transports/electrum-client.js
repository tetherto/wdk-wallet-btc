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
 * @typedef {Object} ElectrumClientConfig
 * @property {number} [timeout] - Connection timeout in milliseconds (default: 15_000).
 */

/**
 * @typedef {Object} ElectrumBalance
 * @property {number} confirmed - Confirmed balance in satoshis.
 * @property {number} [unconfirmed] - Unconfirmed balance in satoshis.
 */

/**
 * @typedef {Object} ElectrumUtxo
 * @property {string} tx_hash - The transaction hash containing this UTXO.
 * @property {number} tx_pos - The output index within the transaction.
 * @property {number} value - The UTXO value in satoshis.
 * @property {number} [height] - The block height (0 if unconfirmed).
 */

/**
 * @typedef {Object} ElectrumHistoryItem
 * @property {string} tx_hash - The transaction hash.
 * @property {number} height - The block height (0 or negative if unconfirmed).
 */

/** @interface */
export default class IElectrumClient {
  /**
   * Closes the connection.
   *
   * @returns {Promise<void>}
   */
  async close () {
    throw new NotImplementedError('close()')
  }

  /**
   * Recreates the underlying socket and reinitializes the session.
   *
   * @returns {Promise<void>}
   */
  async reconnect () {
    throw new NotImplementedError('reconnect()')
  }

  /**
   * Establishes the connection to the Electrum server.
   *
   * @returns {Promise<void>}
   */
  async connect () {
    throw new NotImplementedError('connect()')
  }

  /**
   * Returns the balance for a script hash.
   *
   * @param {string} scripthash - The script hash.
   * @returns {Promise<ElectrumBalance>} The balance information.
   * @see https://electrum.readthedocs.io/en/latest/protocol.html#blockchain-address-get-balance
   */
  async getBalance (scripthash) {
    throw new NotImplementedError('getBalance(scripthash)')
  }

  /**
   * Returns unspent transaction outputs for a script hash.
   *
   * @param {string} scripthash - The script hash.
   * @returns {Promise<ElectrumUtxo[]>} List of UTXOs.
   * @see https://electrum.readthedocs.io/en/latest/protocol.html#blockchain-address-listunspent
   */
  async listUnspent (scripthash) {
    throw new NotImplementedError('listUnspent(scripthash)')
  }

  /**
   * Returns transaction history for a script hash.
   *
   * @param {string} scripthash - The script hash.
   * @returns {Promise<ElectrumHistoryItem[]>} List of transactions.
   * @see https://electrum.readthedocs.io/en/latest/protocol.html#blockchain-address-get-history
   */
  async getHistory (scripthash) {
    throw new NotImplementedError('getHistory(scripthash)')
  }

  /**
   * Returns a raw transaction.
   *
   * @param {string} txHash - The transaction hash.
   * @returns {Promise<string>} Hex-encoded raw transaction.
   * @see https://electrum.readthedocs.io/en/latest/protocol.html#blockchain-transaction-get
   */
  async getTransaction (txHash) {
    throw new NotImplementedError('getTransaction(txHash)')
  }

  /**
   * Broadcasts a raw transaction to the network.
   *
   * @param {string} rawTx - The raw transaction hex.
   * @returns {Promise<string>} Transaction hash if successful.
   * @see https://electrum.readthedocs.io/en/latest/protocol.html#blockchain-transaction-broadcast
   */
  async broadcast (rawTx) {
    throw new NotImplementedError('broadcast(rawTx)')
  }

  /**
   * Returns the estimated fee rate.
   *
   * @param {number} blocks - The confirmation target in blocks.
   * @returns {Promise<number>} Fee rate in BTC/kB.
   * @see https://electrum.readthedocs.io/en/latest/protocol.html#blockchain-estimatefee
   */
  async estimateFee (blocks) {
    throw new NotImplementedError('estimateFee(blocks)')
  }
}
