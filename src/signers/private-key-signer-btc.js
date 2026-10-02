'use strict'

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

import { networks, Psbt } from 'bitcoinjs-lib'
import { ECPair } from '@bitcoinerlab/descriptors'
import { UnsupportedOperationError, ValueError } from '@tetherto/wdk-wallet'

// eslint-disable-next-line camelcase
import { sodium_memzero } from 'sodium-universal'

import { DEFAULT_ADDRESS_TYPE, getAddressFromPublicKey, signMessage, signPsbtWithKey } from './utils.js'

/** @typedef {import('./signer-btc.js').ISignerBtc} ISignerBtc */
/** @typedef {import('./signer-btc.js').BtcSignerConfig} BtcSignerConfig */
/** @typedef {import('./signer-btc.js').BtcAddressType} BtcAddressType */
/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */

/**
 * Signer backed by a single raw private key (non-HD).
 *
 * Does not support HD derivation or extended keys. Signs messages and PSBTs directly using
 * the leaf key.
 *
 * @implements {ISignerBtc}
 */
export default class PrivateKeySignerBtc {
  /**
   * Creates a new private key signer.
   *
   * The supplied key is copied: the signer keeps its own internal copy alive until {@link dispose}
   * zeroes it, and never wipes the supplied key, whose disposal remains the caller's responsibility.
   *
   * @param {string | Uint8Array} privateKey - The raw private key (hex string or 32 bytes).
   * @param {BtcSignerConfig} [config] - The signer configuration.
   * @throws {ValueError} If the private key is not 32 bytes.
   */
  constructor (privateKey, config = {}) {
    privateKey = typeof privateKey === 'string'
      ? Buffer.from(privateKey, 'hex')
      : Buffer.from(privateKey)

    if (privateKey.length !== 32) {
      throw new ValueError('The private key must be 32 bytes.')
    }

    const network = networks[config.network] || networks.bitcoin
    const account = ECPair.fromPrivateKey(privateKey)
    /** @private */
    this._config = config
    /** @private */
    this._account = account
    /** @private */
    this._publicKey = account.publicKey
    /** @private */
    this._address = getAddressFromPublicKey(account.publicKey, network, this.type)
  }

  /**
   * Whether this signer can derive child signers.
   *
   * @type {false}
   */
  get isDerivable () {
    return false
  }

  /**
   * The derivation path. Always null for private-key signers.
   *
   * @type {string | null}
   */
  get path () {
    return null
  }

  /**
   * The account's Bitcoin address.
   *
   * @deprecated Use {@link getAddress} instead. This property will be removed in an upcoming
   * release: not all signers (e.g. hardware signers) can expose the address synchronously.
   * @type {string}
   */
  get address () {
    return this._address
  }

  /**
   * The name of the network the signer's addresses are encoded for.
   *
   * @type {"bitcoin" | "regtest" | "testnet"}
   */
  get network () {
    return networks[this._config.network] ? this._config.network : 'bitcoin'
  }

  /**
   * The address type of the signer's addresses ("legacy" for P2PKH, "segwit" for P2WPKH).
   *
   * @type {BtcAddressType}
   */
  get type () {
    return this._config.type ?? DEFAULT_ADDRESS_TYPE
  }

  /**
   * The account's key pair (public and private keys).
   *
   * @type {KeyPair}
   */
  get keyPair () {
    return {
      privateKey: this._account ? this._account.privateKey : null,
      publicKey: this._publicKey
    }
  }

  /**
   * Derives a child signer using a relative path (e.g. "0'/0/0").
   *
   * @param {string} path - The relative derivation path.
   * @returns {Promise<never>} The derived signer.
   * @throws {UnsupportedOperationError} If the signer does not support account derivation.
   * @throws {ValueError} If the path is not valid.
   */
  async derive (path) {
    throw new UnsupportedOperationError('derive(path)')
  }

  /**
   * Returns the account's derived address.
   *
   * @returns {Promise<string>} The account's address.
   */
  async getAddress () {
    return this._address
  }

  /**
   * Returns the extended public key (e.g. xpub/tpub).
   *
   * @returns {Promise<never>} The extended public key in base58 format.
   * @throws {UnsupportedOperationError} If the signer does not support account derivation.
   */
  async getExtendedPublicKey () {
    throw new UnsupportedOperationError('getExtendedPublicKey()')
  }

  /**
   * Signs a message.
   *
   * @param {string} message - The message to sign.
   * @returns {Promise<string>} The message's signature.
   */
  async sign (message) {
    return signMessage(message, this._account.privateKey, this.type)
  }

  /**
   * Signs a PSBT (Partially Signed Bitcoin Transaction). Caller is responsible for finalizing it; we deliver it partially signed.
   *
   * @param {Psbt | string} psbt - The PSBT instance or base64 string.
   * @returns {Promise<string>} The (partially) signed PSBT in base64 format.
   * @throws {Error} If the signer cannot sign any input of the PSBT.
   */
  async signPsbt (psbt) {
    const psbtInstance = typeof psbt === 'string' ? Psbt.fromBase64(psbt) : psbt
    return signPsbtWithKey(psbtInstance, this._account)
  }

  /**
   * Disposes the signer, securely erasing its internal copy of the private key from memory.
   */
  dispose () {
    if (this._account) {
      sodium_memzero(this._account.privateKey)
    }
    this._account = undefined
  }
}
