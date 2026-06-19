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
import SeedSignerBtc from './signers/seed-signer-btc.js'

/** @typedef {import('@tetherto/wdk-wallet').FeeRates} FeeRates */

/** @typedef {import('./wallet-account-btc.js').BtcWalletConfig} BtcWalletConfig */

/** @typedef {import('./signers/seed-signer-btc.js').ISignerBtc} ISignerBtc */
/** @typedef {import('./transports/index.js').IBtcClient} IBtcClient */

const MEMPOOL_SPACE_URL = 'https://mempool.space'

export default class WalletManagerBtc extends WalletManager {
  /**
   * Creates a new wallet manager for the bitcoin blockchain.
   *
   * Accepts either a BIP-39 seed (string mnemonic or raw Uint8Array) for
   * backwards compatibility, or an {@link ISignerBtc} instance for the new
   * signer-based workflow.
   *
   * @param {string | Uint8Array | ISignerBtc} seedOrSigner - A BIP-39 seed phrase, raw seed bytes, or a root signer.
   * @param {BtcWalletConfig} [config] - The configuration object.
   */
  constructor (seedOrSigner, config = {}) {
    let signer = seedOrSigner
    if (typeof seedOrSigner === 'string' || seedOrSigner instanceof Uint8Array) {
      const { client, ...signerConfig } = config
      signer = new SeedSignerBtc(seedOrSigner, signerConfig)
    }
    if (!signer.isDerivable) {
      throw new Error('The default signer must be derivable. Non-derivable signers (e.g. private-key signers) can only be registered by name via addSigner.')
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

    if (this._clientList.length > 1) {
      const failoverProvider = new FailoverProvider({ retries: this._config.retries })
      for (const entry of this._clientList) {
        failoverProvider.addProvider(entry)
      }
      this._client = failoverProvider.initialize()
    }
  }

  /**
   * Returns the wallet account at a specific index.
   *
   * @overload
   * @param {number} [index] - The index of the account to get (default: 0).
   * @param {Object} [options] - Account options.
   * @param {string} [options.signerName] - The signer name. Omit to use the default signer.
   * @returns {Promise<WalletAccountBtc>} The account.
   *
   * @overload
   * @param {string} signerName - The signer name registered via {@link addSigner}.
   * @returns {Promise<WalletAccountBtc>} The account.
   *
   * @example
   * // Returns the account with derivation path
   * // For mainnet (bitcoin): m/84'/0'/0'/0/1
   * // For testnet or regtest: m/84'/1'/0'/0/1
   * const account = await wallet.getAccount(1);
   */
  async getAccount (indexOrSignerName = 0, options = {}) {
    if (typeof indexOrSignerName === 'string') {
      const key = `${indexOrSignerName}#self`
      if (this._accounts[key]) {
        return this._accounts[key]
      }
      const signer = this.getSigner(indexOrSignerName)
      const accountSigner = signer.isDerivable
        ? await signer.derive(this._relativePath(signer))
        : signer
      const account = new WalletAccountBtc(accountSigner, { client: this._clientList })
      this._accounts[key] = account
      return account
    }

    const { signerName } = options
    return await this.getAccountByPath(`0'/0/${indexOrSignerName}`, { signerName })
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
   * @param {Object} [options] - Account options.
   * @param {string} [options.signerName] - The signer name. Omit to use the default signer.
   * @returns {Promise<WalletAccountBtc>} The account.
   * @throws {Error} If a signer name is given but no signer exists with that name.
   * @throws {SignerError} If the signer doesn't support account derivation.
   */
  async getAccountByPath (path, options = {}) {
    const { signerName } = options
    const key = `${signerName ?? ''}:${path}`
    if (this._accounts[key]) {
      return this._accounts[key]
    }
    const signer = this.getSigner(signerName)
    const childSigner = await signer.derive(path)
    const account = new WalletAccountBtc(childSigner, { client: this._clientList })
    this._accounts[key] = account
    return account
  }

  /** @private */
  _relativePath (signer) {
    if (!signer.path) return "0'/0/0"
    return signer.path.split('/').slice(-3).join('/')
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
