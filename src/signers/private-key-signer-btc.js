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
import * as ecc from '@bitcoinerlab/secp256k1'
import { ECPairFactory } from 'ecpair'
import { SignerError } from '@tetherto/wdk-wallet'

// eslint-disable-next-line camelcase
import { sodium_memzero } from 'sodium-universal'

import { normalizeConfig, getAddressFromPublicKey, signMessage, signPsbtWithKey } from './utils.js'

const ECPair = ECPairFactory(ecc)
/** @typedef {import('../wallet-account-read-only-btc.js').BtcWalletConfig} BtcWalletConfig */
/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('./seed-signer-btc.js').ISignerBtc} ISignerBtc */

/**
 * Signer backed by a single raw private key (non-HD).
 *
 * Does not support HD derivation, extended keys, or master fingerprint.
 * Signs messages and PSBTs directly using the leaf key.
 *
 * @implements {ISignerBtc}
 */
export default class PrivateKeySignerBtc {
  /**
   * Creates a new private key signer.
   *
   * @param {string | Uint8Array | Buffer} privateKey - The raw private key (hex string or 32 bytes).
   * @param {BtcWalletConfig} [config] - The wallet configuration.
   */
  constructor (privateKey, config = {}) {
    config = normalizeConfig(config)

    let pkBuf
    if (typeof privateKey === 'string') {
      pkBuf = Buffer.from(privateKey, 'hex')
    } else if (Buffer.isBuffer(privateKey)) {
      pkBuf = privateKey
    } else {
      // Wrap Uint8Array as a Buffer view over the same ArrayBuffer (zero-copy)
      pkBuf = Buffer.from(privateKey.buffer, privateKey.byteOffset, privateKey.byteLength)
    }

    if (pkBuf.length !== 32) {
      throw new Error('PrivateKeySignerBtc: privateKey must be 32-byte Buffer or 64-char hex')
    }
    const account = ECPair.fromPrivateKey(pkBuf)
    const network = networks[config.network] || networks.testnet
    const address = getAddressFromPublicKey(account.publicKey, network, config.bip)
    /**
     * @private
     * @type {BtcWalletConfig}
     */
    this._config = config
    /** @private */
    this._account = account
    /** @private */
    this._address = address
  }

  /**
   * Whether this signer can derive child signers. Always false for private-key signers.
   *
   * @type {boolean}
   */
  get isDerivable () {
    return false
  }

  /**
   * The account index. Always undefined for private-key signers.
   *
   * @type {number | undefined}
   */
  get index () {
    return undefined
  }

  /**
   * The derivation path. Always undefined for private-key signers.
   *
   * @type {string | undefined}
   */
  get path () {
    return undefined
  }

  /**
   * The account's key pair (public and private keys).
   *
   * @type {KeyPair}
   */
  get keyPair () {
    return {
      privateKey: this._account ? this._account.privateKey : null,
      publicKey: this._account.publicKey
    }
  }

  /**
   * The wallet configuration.
   *
   * @type {BtcWalletConfig}
   */
  get config () {
    return this._config
  }

  /**
   * The account's Bitcoin address.
   *
   * @type {string}
   */
  get address () {
    return this._address
  }

  /**
   * Not supported for private key signers.
   *
   * @returns {Promise<never>}
   * @throws {SignerError} Always — private-key signers do not support derivation.
   */
  async derive () {
    throw new SignerError('PrivateKeySignerBtc does not support derivation.')
  }

  /**
   * Not available for private key signers.
   *
   * @throws {Error} Always throws since extended keys require HD derivation.
   */
  async getExtendedPublicKey () {
    throw new Error('Extended public key is unavailable for private-key imported signers.')
  }

  /**
   * Signs a message.
   *
   * @param {string} message - The message to sign.
   * @returns {Promise<string>} The message's signature.
   */
  async sign (message) {
    return signMessage(message, this._account.privateKey, this._config.bip)
  }

  /**
   * Signs a PSBT (Partially Signed Bitcoin Transaction).
   *
   * @param {Psbt | string} psbt - The PSBT instance or base64 string.
   * @returns {Promise<string>} The signed PSBT in base64 format.
   */
  async signPsbt (psbt) {
    const psbtInstance = typeof psbt === 'string' ? Psbt.fromBase64(psbt) : psbt
    const network = networks[this._config.network] || networks.bitcoin
    return signPsbtWithKey(psbtInstance, this._account, this._config.bip, network)
  }

  /**
   * Signs a transaction. For Bitcoin the generic transaction form is a PSBT, so this is a thin
   * wrapper over {@link signPsbt}.
   *
   * @param {Psbt | string} tx - The PSBT instance or base64 string.
   * @returns {Promise<string>} The signed PSBT in base64 format.
   */
  async signTransaction (tx) {
    return this.signPsbt(tx)
  }

  /**
   * Disposes the signer, securely erasing the private key from memory.
   */
  dispose () {
    if (this._account) {
      sodium_memzero(this._account.privateKey)
      if (this._account.chainCode) {
        sodium_memzero(this._account.chainCode)
      }
    }
  }
}
