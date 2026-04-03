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

import WalletAccountBtc from './wallet-account-btc.js'

/** @typedef {import('@tetherto/wdk-wallet').FeeRates} FeeRates */

/** @typedef {import('./wallet-account-btc.js').BtcWalletConfig} BtcWalletConfig */

/** @typedef {import('./signers/seed-signer-btc.js').ISignerBtc} ISignerBtc */
/** @typedef {import('./transports/index.js').IBtcClient} IBtcClient */

const MEMPOOL_SPACE_URL = 'https://mempool.space'

export default class WalletManagerBtc extends WalletManager {
  /**
   * Creates a new wallet manager for the bitcoin blockchain.
   *
   * @param {ISignerBtc} signer - The root signer for the wallet.
   * @param {BtcWalletConfig} [config] - The configuration object.
   */
  constructor (signer, config = {}) {
    if (signer.isPrivateKey) {
      throw new Error('Private key signers are not supported for wallet managers.')
    }
    super(signer, config)

    const clientOptions = config.client ? [config.client].flat() : [{ type: 'electrum', clientConfig: { host: 'electrum.blockstream.info', port: 50_001 } }]

    /**
     * A list of all the bitcoin client options.
     *
     * @protected
     * @type {Array<IBtcClient>}
     */
    this._clientList = clientOptions.map(client => WalletAccountBtc._createClient(client, this._config.network))

    /**
     * A client to interact with the bitcoin network.
     *
     * @protected
     * @type {IBtcClient}
     */
    this._client = this._clientList[0]
  }

  /**
   * Creates a new signer.
   *
   * @param {string} signerName - The signer name.
   * @param {ISignerBtc} signer - The signer.
   */
  createSigner (signerName, signer) {
    if (!signerName) {
      throw new Error('Signer name is required.')
    }

    this._signers[signerName] = signer
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
   * @param {string} signerName - The signer name.
   * @returns {Promise<WalletAccountBtc>} The account.
   */
  async getAccount (index = 0, signerName = 'default') {
    return await this.getAccountByPath(`0'/0/${index}`, signerName)
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
   * @param {string} signerName - The signer name.
   * @returns {Promise<WalletAccountBtc>} The account.
   */
  async getAccountByPath (path, signerName = 'default') {
    const key = `${signerName}:${path}`
    if (this._accounts[key]) {
      return this._accounts[key]
    }
    const signer = this._signers[signerName]
    if (!signer) {
      throw new Error(`Signer ${signerName} not found.`)
    }
    const { client, ...signerConfig } = this._config
    const childSigner = signer.derive(path, signerConfig)
    const account = new WalletAccountBtc(childSigner, { client: this._clientList })
    this._accounts[key] = account
    return account
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
   * A list that maps each client to a flag that is true only if the client was externally provided.
   *
   * @protected
   * @type {Array<boolean>}
   */
  get _isExternalClient () {
    if (!this._config.client) return [false]
    return [this._config.client].flat().map(client => typeof client.connect === 'function')
  }

  /**
   * Disposes all the wallet accounts, erasing their private keys from the memory and closing all internal connections.
   */
  dispose () {
    for (const [i, isExternal] of this._isExternalClient.entries()) {
      if (!isExternal) {
        this._clientList[i].close()
      }
    }

    super.dispose()
  }
}
