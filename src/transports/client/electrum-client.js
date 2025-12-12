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
 * Interface for Electrum clients.
 *
 * @abstract
 */
export default class IElectrumClient {
  /**
   * Closes the connection.
   *
   * @abstract
   * @returns {void}
   */
  close () {
    throw new NotImplementedError('close()')
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
   * Returns the balance for a script hash.
   *
   * @abstract
   * @param {string} scripthash - The script hash.
   * @returns {Promise<{ confirmed: number }>} Confirmed balance in satoshis.
   */
  getBalance (scripthash) {
    throw new NotImplementedError('getBalance(scripthash)')
  }

  /**
   * Returns unspent transaction outputs for a script hash.
   *
   * @abstract
   * @param {string} scripthash - The script hash.
   * @returns {Promise<Array<{ tx_hash: string, tx_pos: number, value: number }>>} List of UTXOs.
   */
  listUnspent (scripthash) {
    throw new NotImplementedError('listUnspent(scripthash)')
  }

  /**
   * Returns transaction history for a script hash.
   *
   * @abstract
   * @param {string} scripthash - The script hash.
   * @returns {Promise<Array<{ tx_hash: string, height: number }>>} List of transactions.
   */
  getHistory (scripthash) {
    throw new NotImplementedError('getHistory(scripthash)')
  }

  /**
   * Returns a raw transaction.
   *
   * @abstract
   * @param {string} txHash - The transaction hash.
   * @returns {Promise<string>} Hex-encoded raw transaction.
   */
  getTransaction (txHash) {
    throw new NotImplementedError('getTransaction(txHash)')
  }

  /**
   * Broadcasts a raw transaction to the network.
   *
   * @abstract
   * @param {string} rawTx - The raw transaction hex.
   * @returns {Promise<string>} Transaction hash if successful.
   */
  broadcast (rawTx) {
    throw new NotImplementedError('broadcast(rawTx)')
  }

  /**
   * Returns the estimated fee rate.
   *
   * @abstract
   * @param {number} blocks - The confirmation target in blocks.
   * @returns {Promise<number>} Fee rate in BTC/kB.
   */
  estimateFee (blocks) {
    throw new NotImplementedError('estimateFee(blocks)')
  }
}
