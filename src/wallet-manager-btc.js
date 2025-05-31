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

import { generateMnemonic, validateMnemonic } from 'bip39'

import sodium from 'sodium-universal'

import WalletAccountBtc from './wallet-account-btc.js'

const MEMPOOL_SPACE_URL = 'https://mempool.space'

/** @typedef {import('./wallet-account-btc.js').BtcWalletConfig} BtcWalletConfig */

export default class WalletManagerBtc {
  #seedBuffer
  #config
  #accounts

  /**
   * Creates a new wallet manager for the bitcoin blockchain.
   *
   * @param {Uint8Array} seedBuffer - Uint8Array seed buffer.
   * @param {BtcWalletConfig} [config] - The configuration object.
   */
  constructor (seedBuffer, config = {}) {
    this.#seedBuffer = seedBuffer
    this.#accounts = new Set()
    this.#config = config
  }

  /**
   * Returns a random [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) seed phrase.
   *
   * @returns {string} The seed phrase.
   */
  static getRandomSeedPhrase () {
    return generateMnemonic()
  }

  /**
   * Checks if a seed phrase is valid.
   *
   * @param {string} seedPhrase - The seed phrase.
   * @returns {boolean} True if the seed phrase is valid.
   */
  static isValidSeedPhrase (seedPhrase) {
    return validateMnemonic(seedPhrase)
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
    const account = await this.getAccountByPath(`0'/0/${index}`)
    this.#accounts.add(account)
    return account
  }

  /**
   * Returns the wallet account at a specific BIP-84 derivation path.
   *
   * @example
   * // Returns the account with derivation path m/84'/0'/0'/0/1
   * const account = await wallet.getAccountByPath("0'/0/1");
   * @param {string} path - The derivation path (e.g. "0'/0/0").
   * @returns {Promise<WalletAccountBtc>} The account.
   */
  async getAccountByPath (path) {
    const account = new WalletAccountBtc(this.#seedBuffer, path, this.#config)
    this.#accounts.add(account)
    return account
  }

  /**
   * Returns the current fee rates.
   *
   * @returns {Promise<{ normal: number, fast: number }>} The fee rates (in satoshis).
   */
  async getFeeRates () {
    const response = await fetch(`${MEMPOOL_SPACE_URL}/api/v1/fees/recommended`)
    const { fastestFee, hourFee } = await response.json()
    return { normal: hourFee, fast: fastestFee }
  }

  /**
   * Close the wallet manager and erase the seed buffer.
   */
  close () {
    for (const account of this.#accounts) account.close()
    this.#accounts.clear()

    sodium.sodium_memzero(this.#seedBuffer)

    this.#seedBuffer = null
    this.#config = null
  }
}
