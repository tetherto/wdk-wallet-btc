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

// eslint-disable-next-line camelcase
import { sodium_memzero } from 'sodium-universal'

import { hashMessage, buildPaymentScript, detectInputOwnership, ensureWitnessUtxoIfNeeded, normalizeConfig, getAddressFromPublicKey } from './utils.js'

const ECPair = ECPairFactory(ecc)
/** @typedef {import('../wallet-account-read-only-btc.js').BtcWalletConfig} BtcWalletConfig */

/**
 * Signer backed by a single raw private key (non-HD).
 * - Does not support HD derivation, extended keys, or master fingerprint.
 * - Signs messages and PSBTs directly using the leaf key.
 */
export default class PrivateKeySignerBtc {
  /**
   * @param {string | Uint8Array | Buffer} privateKey - Hex string or bytes of the raw private key
   * @param {BtcWalletConfig} [config] - Network/BIP configuration (bip defaults to 44, network to 'bitcoin')
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

  get isPrivateKey () {
    return this._isPrivateKey
  }

  get isActive () {
    return this._isActive
  }

  // Not meaningful for non-HD private key signers
  get index () {
    throw new Error('HD index is unavailable for private-key imported signers.')
  }

  get path () {
    throw new Error('HD path is unavailable for private-key imported signers.')
  }

  get keyPair () {
    return {
      privateKey: this._account ? new Uint8Array(this._account.privateKey) : null,
      publicKey: new Uint8Array(this._account.publicKey)
    }
  }

  get config () {
    return this._config
  }

  get address () {
    return this._address
  }

  // Non-HD signer cannot derive children
  derive () {
    throw new Error('derive is not supported for PrivateKeySignerBtc.')
  }

  async getExtendedPublicKey () {
    throw new Error('Extended public key is unavailable for private-key imported signers.')
  }

  async getWalletAddress () {
    throw new Error('Method implemented only in Signers with transport layer')
  }

  async sign (message) {
    const messageHash = hashMessage(message)
    return this._account.sign(messageHash).toString('hex')
  }

  async verify (message, signature) {
    const messageHash = hashMessage(message)
    const signatureBuffer = Buffer.from(signature, 'hex')
    return this._account.verify(messageHash, signatureBuffer)
  }

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

  dispose () {
    if (this._account) {
      sodium_memzero(this._account.privateKey)
      sodium_memzero(this._account.chainCode)
    }
    this._account = undefined
    this._isActive = false
  }
}
