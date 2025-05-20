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

import ElectrumClient from './electrum-client.js'
import WalletAccountBtc from './wallet-account-btc.js'

const BIP_84_BTC_DERIVATION_PATH_PREFIX = "m/84'/0'"

const MEMPOOL_SPACE_URL = 'https://mempool.space'

const bip32 = BIP32Factory(ecc)

/**
 * @typedef {Object} BtcWalletConfig
 * @property {string} [host] - The electrum server's hostname (default: "electrum.blockstream.info").
 * @property {number} [port] - The electrum server's port (default: 50001).
 * @property {string} [network] - The name of the network to use; available values: "bitcoin", "regtest", "testnet" (default: "bitcoin").
 */

export default class WalletManagerBtc {
  #seedPhrase
  #electrumClient
  #bip32

  /**
   * Creates a new wallet manager for the bitcoin blockchain.
   *
   * @param {string} seedPhrase - The wallet's [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) seed phrase.
   * @param {BtcWalletConfig} [config] - The configuration object.
   */
  constructor (seedPhrase, config = {}) {
    if (!WalletManagerBtc.isValidSeedPhrase(seedPhrase)) {
      throw new Error('Seed phrase is invalid.')
    }

    this.#seedPhrase = seedPhrase

    this.#electrumClient = new ElectrumClient(config)

    this.#bip32 = WalletManagerBtc.#seedPhraseToBip32(seedPhrase)
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
   * @returns {Promise<WalletAccountBtc>} The account.
  */
  async getAccount (index = 0) {
    return await this.getAccountByPath(`0'/0/${index}`)
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
    path = `${BIP_84_BTC_DERIVATION_PATH_PREFIX}/${path}`

    const child = this.#bip32.derivePath(path)

    const { address } = payments.p2wpkh({
      pubkey: child.publicKey,
      network: this.#electrumClient.network
    })

    const keyPair = {
      publicKey: child.publicKey.toString('hex'),
      privateKey: child.toWIF()
    }

    return new WalletAccountBtc({
      path,
      address,
      keyPair,
      electrumClient: this.#electrumClient,
      bip32: this.#bip32
    })
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

  static #seedPhraseToBip32 (seedPhrase) {
    const seed = mnemonicToSeedSync(seedPhrase)
    const root = bip32.fromSeed(seed)
    return root
  }
}
