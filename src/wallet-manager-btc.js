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

import AbstractWalletManager from '@wdk/wallet'
import sodium from 'sodium-universal'
import WalletAccountBtc from './wallet-account-btc.js'

const MEMPOOL_SPACE_URL = 'https://mempool.space'

/**
 * @typedef {import('./abstract-wallet-manager.js').FeeRates}             FeeRates
 * @typedef {import('./wallet-account-btc.js').default}                  WalletAccountBtc
 * @typedef {import('./wallet-account-btc.js').BtcWalletConfig}         BtcWalletConfig
 */

export default class WalletManagerBtc extends AbstractWalletManager {
  /**
   * Creates a new wallet manager for the bitcoin blockchain.
   *
   * @param {string | Uint8Array} seed - The wallet's [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) seed phrase.
   * @param {number}  bip - The address type, default to 44
   * @param {BtcWalletConfig} [config] - The configuration object.
   */
  constructor (seed, config = {}) {
    super(seed, config)

    /**
     * @private
     * @type {Map<string, WalletAccountBtc>}
     */
    this._accounts = new Map()
  }

  async getAccount (index = 0) {
    return await this.getAccountByPath(`0'/0/${index}`)
  }

  async getAccountByPath (path) {
    if (!this._accounts.has(path)) {
      const account = new WalletAccountBtc(this._seed, path, this._config)
      this._accounts.set(path, account)
    }
    return this._accounts.get(path)
  }

  /**
   * Returns the current fee rates.
   *
   * @returns {Promise<FeeRates>} The fee rates (in satoshis).
   */
  async getFeeRates () {
    const response = await fetch(`${MEMPOOL_SPACE_URL}/api/v1/fees/recommended`)
    const { fastestFee, hourFee } = await response.json()
    return { normal: hourFee, fast: fastestFee }
  }

  dispose () {
    for (const account of this._accounts.values()) {
      account.dispose()
    }
    this._accounts.clear()

    sodium.sodium_memzero(this._seed)
    this._seed = null
    this._config = null
  }
}
