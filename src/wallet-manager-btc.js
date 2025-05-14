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

import ecc from '@bitcoinerlab/secp256k1'
import { BIP32Factory } from 'bip32'
import { generateMnemonic, validateMnemonic, mnemonicToSeedSync } from 'bip39'
import { payments } from 'bitcoinjs-lib'
import https from 'https'

import ElectrumClient from './electrum-client.js'
import WalletAccountBtc from './wallet-account-btc.js'

const BIP_84_BTC_DERIVATION_PATH = 'm/84\'/0\'/0\'/0'

const bip32 = BIP32Factory(ecc)

export default class WalletManagerBtc {
  #seedPhrase
  #electrumClient
  #hdPath

  /**
   * Creates a new wallet manager for the bitcoin blockchain.
   *
   * @param {string} seedPhrase - The wallet's [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) seed phrase.
   * @param {string} path - Derivation path
   * @param {Object} [config] - The configuration object.
   * @param {string} [config.host] - The electrum server's hostname (default: "electrum.blockstream.info").
   * @param {number} [config.port] - The electrum server's port (default: 50001).
   * @param {string} [config.network] - The name of the network to use; available values: "bitcoin", "regtest", "testnet" (default: "bitcoin").
   */
  constructor (seedPhrase, path, config = {}) {
    if (!WalletManagerBtc.isValidSeedPhrase(seedPhrase)) {
      throw new Error('Seed phrase is invalid.')
    }

    this.#hdPath = path || BIP_84_BTC_DERIVATION_PATH

    if (this.#hdPath.split('/')[1] !== "84'") throw new Error('Must be a BIP84 hd path')

    this.#seedPhrase = seedPhrase

    this.#electrumClient = new ElectrumClient(config)
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
   * The seed phrase of the wallet.
   *
   * @type {string}
   */
  get seedPhrase () {
    return this.#seedPhrase
  }

  /**
   * Returns the wallet account at a specific index (see [BIP-84](https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki)).
   *
   * @example
   * // Returns the account with derivation path m/84'/0'/0'/0/1
   * const account = await wallet.getAccount(1);
   * @param {number} [index] - The index of the account to get (default: 0).
   * @returns {WalletAccountBtc} The account.
  */
  async getAccount (index = 0) {
    const path = this.#getBIP84HDPathString(index)

    const { address, keyPair } = this.#getAccountAttributes(path)

    return new WalletAccountBtc({
      path,
      index,
      address,
      keyPair,
      electrumClient: this.#electrumClient,
      bip32: this.#seedToBip32(this.#seedPhrase)
    })
  }

  #getBIP84HDPathString (index = 0) {
    if (typeof index === 'string') {
      const [account, change] = index.split('/').map(Number)
      return `m/84'/0'/${account || '0'}'/${change || '0'}`
    }
    return `${this.#hdPath}/${index}`
  }

  #deriveChild (mnemonic, path) {
    const root = this.#seedToBip32(mnemonic)
    const child = root.derivePath(path)
    return child
  }

  #seedToBip32 (mnemonic) {
    const seed = mnemonicToSeedSync(mnemonic)
    const root = bip32.fromSeed(seed)
    return root
  }

  #getAccountAttributes (path) {
    const child = this.#deriveChild(this.#seedPhrase, path)

    const address = payments.p2wpkh({
      pubkey: child.publicKey,
      network: this.#electrumClient.network
    }).address

    const keyPair = {
      publicKey: child.publicKey.toString('hex'),
      privateKey: child.toWIF()
    }

    return {
      address, keyPair
    }
  }

  /**
 * Fetches recommended Bitcoin fee rates from the Mempool.space API.
 *
 * @returns {Promise<{ slow: number, fast: number }>}
 *   A promise that resolves to an object containing:
 *   - slow: fee rate in sat/vB targeting confirmation within ~60 minutes
 *   - fast: fee rate in sat/vB targeting confirmation in the next block
 * @throws {Error} If the response cannot be parsed as JSON or the request fails
 */
  getFeeRate () {
    return new Promise((resolve, reject) => {
      https.get('https://mempool.space/api/v1/fees/recommended', (res) => {
        let raw = ''
        res.on('data', chunk => raw += chunk)
        res.on('end', () => {
          try {
            const { fastestFee, hourFee } = JSON.parse(raw)
            resolve({ slow: hourFee, fast: fastestFee })
          } catch (err) {
            reject(err)
          }
        })
      }).on('error', reject)
    })
  }

  /**
   * Returns the wallet account at a specific BIP-84/BIP-44 derivation path.
   *
   * @param {string} path - The full derivation path (e.g. "m/84'/0'/0'/0/1" or "/0'/1/2").
   *   If it starts with "/", it will be appended to the base BIP-84 path.
   * @returns {Promise<WalletAccountBtc>} The account for that path.
   */
  async getAccountByPath (path) {
    const { address, keyPair } = this.#getAccountAttributes(path)

    return new WalletAccountBtc({
      path,
      index: path.split('/').pop(),
      address,
      keyPair,
      electrumClient: this.#electrumClient,
      bip32: this.#seedToBip32(this.#seedPhrase)
    })
  }
}
