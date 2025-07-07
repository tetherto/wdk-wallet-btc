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

import WalletManager from '@wdk/wallet'

import WalletAccountBtc from './wallet-account-btc.js'

/** @typedef {import('@wdk/wallet').FeeRates} FeeRates */

/** @typedef {import('./wallet-account-btc.js').BtcWalletConfig} BtcWalletConfig */

const MEMPOOL_SPACE_URL = 'https://mempool.space'

export default class WalletManagerBtc extends WalletManager {
  /**
   * Creates a new wallet manager for the bitcoin blockchain.
   *
   * @param {string | Uint8Array} seed - The wallet's [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) seed phrase.
   * @param {BtcWalletConfig} [config] - The configuration object.
   */
  constructor (seed, config = {}) {
    super(seed, config)

    /**
     * The btc wallet configuration.
     *
     * @protected
     * @type {BtcWalletConfig}
     */
    this._config = config

    /** @private */
    this._accounts = {}
  }

  /**
   * Returns the wallet account at a specific index (see [BIP-84](https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki)).
   *
   * @example
   * // Returns the account with derivation path m/84'/0'/0'/0/1
   * const account = await wallet.getAccount(1);
   * @param {number} [index] - The index of the account to get (default: 0).
   * @returns {Promise<WalletAccountBtc>} The account.
   */
  async getAccount (index = 0) {
    return await this.getAccountByPath(`0'/0/${index}`)
  }

  /**
   * Returns the wallet account at a configured derivation path.
   *
   * @example
   * // Returns the account with derivation path m/84'/0'/0'/0/1
   * const account = await wallet.getAccountByPath("0'/0/1");
   * @param {string} path - The derivation path (e.g. "0'/0/0").
   * @returns {Promise<WalletAccountBtc>} The account.
   */
  async getAccountByPath (path) {
    if (!this._accounts[path]) {
      const account = new WalletAccountBtc(this._seed, path, this._config)

      this._accounts[path] = account
    }

    return this._accounts[path]
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

  /**
   * Disposes all the wallet accounts, erasing their private keys from the memory and closing the connection with the electrum server.
   */
  dispose () {
    for (const account of Object.values(this._accounts)) {
      account.dispose()
    }

    this._accounts = {}
  }
}
