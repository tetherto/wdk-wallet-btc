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
import * as bitcoinMessage from 'bitcoinjs-message'

// eslint-disable-next-line camelcase
import { sodium_memzero } from 'sodium-universal'

import { buildPaymentScript, detectInputOwnership, ensureWitnessUtxoIfNeeded, normalizeConfig, getAddressFromPublicKey } from './utils.js'

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
    const cfg = normalizeConfig(config)
    const pkBuf = typeof privateKey === 'string'
      ? Buffer.from(privateKey, 'hex')
      : Buffer.from(privateKey)

    if (pkBuf.length !== 32) {
      throw new Error('PrivateKeySignerBtc: privateKey must be 32-byte Buffer or 64-char hex')
    }
    const account = ECPair.fromPrivateKey(pkBuf)
    const network = networks[cfg.network] || networks.bitcoin
    const address = getAddressFromPublicKey(account.publicKey, network, config.bip)
    this._isActive = true
    this._config = cfg
    this._account = account
    this._address = address
    this._isPrivateKey = true
  }

  /**
   * Whether this signer is backed by a raw private key.
   *
   * @type {boolean}
   */
  get isPrivateKey () {
    return this._isPrivateKey
  }

  /**
   * Whether the signer is still active (not disposed).
   *
   * @type {boolean}
   */
  get isActive () {
    return this._isActive
  }

  /**
   * Not available for private key signers.
   *
   * @throws {Error} Always throws since HD index is unavailable.
   */
  get index () {
    throw new Error('HD index is unavailable for private-key imported signers.')
  }

  /**
   * Not available for private key signers.
   *
   * @throws {Error} Always throws since HD path is unavailable.
   */
  get path () {
    throw new Error('HD path is unavailable for private-key imported signers.')
  }

  /**
   * The account's key pair (public and private keys).
   *
   * @type {KeyPair}
   */
  get keyPair () {
    return {
      privateKey: this._account ? new Uint8Array(this._account.privateKey) : null,
      publicKey: new Uint8Array(this._account.publicKey)
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
   * @throws {Error} Always throws since derivation requires HD keys.
   */
  derive () {
    throw new Error('derive is not supported for PrivateKeySignerBtc.')
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
    return bitcoinMessage
      .sign(
        message,
        this._account.privateKey,
        true,
        this._bip === 84 ? { segwitType: 'p2wpkh' } : undefined
      )
      .toString('base64')
  }

  /**
   * Signs a PSBT (Partially Signed Bitcoin Transaction).
   *
   * @param {Psbt | string} psbt - The PSBT instance or base64 string.
   * @returns {Promise<string>} The signed PSBT in base64 format.
   */
  async signPsbt (psbt) {
    const psbtInstance = typeof psbt === 'string' ? Psbt.fromBase64(psbt) : psbt

    const pubkey = this._account && this._account.publicKey
    if (!pubkey) return psbtInstance.toBase64()

    const network = networks[this._config.network] || networks.bitcoin
    const myScript = buildPaymentScript(this._config.bip, pubkey, network)

    for (let i = 0; i < psbtInstance.inputCount; i++) {
      const { input, prevOut, isOurs } = detectInputOwnership(psbtInstance, i, myScript)

      if (!isOurs) continue

      ensureWitnessUtxoIfNeeded(psbtInstance, i, this._config.bip, prevOut, input)

      try {
        // Non-HD signing with the leaf key
        psbtInstance.signInput(i, this._account)
      } catch (_) {}
    }

    return psbtInstance.toBase64()
  }

  /**
   * Disposes the signer, securely erasing the private key from memory.
   */
  dispose () {
    if (this._account) {
      sodium_memzero(this._account.privateKey)
      sodium_memzero(this._account.chainCode)
    }
    this._account = undefined
    this._isActive = false
  }
}
