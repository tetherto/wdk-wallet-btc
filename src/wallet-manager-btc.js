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

import WalletManager from '@tetherto/wdk-wallet'

import FailoverProvider from '@tetherto/wdk-failover-provider'

import WalletAccountBtc from './wallet-account-btc.js'

/** @typedef {import('@tetherto/wdk-wallet').FeeRates} FeeRates */

/** @typedef {import('./wallet-account-btc.js').BtcWalletConfig} BtcWalletConfig */

/** @typedef {import('./transports/index.js').IBtcClient} IBtcClient */

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
     * A client to interact with the bitcoin network.
     *
     * @private
     * @type {IBtcClient}
     */
    this._client = undefined

    const { client, blockbookUrl, retries = 3 } = config

    /**
     * @private
     * @type {IBtcClient[]}
     */
    const provider = []

    if (Array.isArray(client)) {
      client.forEach(candidate => provider.push(candidate))
    } else if (client) {
      provider.push(client)
    }

    if (Array.isArray(blockbookUrl)) {
      blockbookUrl.forEach(candidate => provider.push(
        WalletAccountBtc._createClient({ ...config, blockbookUrl: candidate })
      ))
    } else if (blockbookUrl) {
      provider.push(WalletAccountBtc._createClient(config))
    }

    if (provider.length > 1) {
      this._client = provider
        .reduce(
          (failover, candidate) => failover.addProvider(candidate),
          new FailoverProvider({ retries })
        )
        .initialize()
    } else if (provider.length === 1) {
      this._client = provider[0]
    } else {
      this._client = WalletAccountBtc._createClient(config)
    }
  }

  /**
   * Returns the wallet account at a specific index (defaults to [BIP-84](https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki); set config.bip=44 for [BIP-44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)).
   *
   * @example
   * // Returns the account with derivation path
   * // For mainnet (bitcoin): m/84'/0'/0'/0/1
   * // For testnet or regtest: m/84'/1'/0'/0/1
   * const account = await wallet.getAccount(1);
   * @param {number} [index] - The index of the account to get (default: 0).
   * @returns {Promise<WalletAccountBtc>} The account.
   */
  async getAccount (index = 0) {
    return await this.getAccountByPath(`0'/0/${index}`)
  }

  /**
   * Returns the wallet account at a specific derivation path.
   *
   * @example
   * // Returns the account with derivation path:
   * // For mainnet (bitcoin): m/84'/0'/0'/0/1
   * // For testnet or regtest: m/84'/1'/0'/0/1
   * const account = await wallet.getAccountByPath("0'/0/1");
   * @param {string} path - The derivation path (e.g. "0'/0/0").
   * @returns {Promise<WalletAccountBtc>} The account.
   */
  async getAccountByPath (path) {
    if (!this._accounts[path]) {
      const { network, bip } = this._config

      const account = new WalletAccountBtc(this._seed, path, { client: this._client, network, bip })

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

    return {
      normal: BigInt(hourFee),
      fast: BigInt(fastestFee)
    }
  }

  /**
   * Disposes all the wallet accounts, erasing their private keys from the memory and closing all internal connections.
   */
  dispose () {
    if (!this._config.client && !this._config.blockbookUrl) {
      this._client.close()
    }
    super.dispose()
  }
}
