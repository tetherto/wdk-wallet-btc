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
import { hmac } from '@noble/hashes/hmac'
import { sha512 } from '@noble/hashes/sha2'
import { initEccLib, networks, Psbt } from 'bitcoinjs-lib'
import { BIP32Factory } from 'bip32'
import { ISigner, NotImplementedError, SignerError } from '@tetherto/wdk-wallet'

import * as bip39 from 'bip39'
import * as ecc from '@bitcoinerlab/secp256k1'

// eslint-disable-next-line camelcase
import { sodium_memzero } from 'sodium-universal'

/** @typedef {import('../wallet-account-read-only-btc.js').BtcWalletConfig} BtcWalletConfig */
/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('bip32').BIP32Interface} BIP32Interface */

import {
  normalizeConfig,
  getAddressFromPublicKey,
  signMessage,
  signPsbtWithKey
} from './utils.js'

const MASTER_SECRET = Buffer.from('Bitcoin seed', 'utf8')

const BITCOIN = {
  wif: 0x80,
  bip32: { public: 0x0488b21e, private: 0x0488ade4 },
  messagePrefix: '\x18Bitcoin Signed Message:\n',
  bech32: 'bc',
  pubKeyHash: 0x00,
  scriptHash: 0x05
}
const bip32 = BIP32Factory(ecc)

initEccLib(ecc)

/** @private */
function deriveMasterNode (seed) {
  const masterKeyAndChainCodeBuffer = hmac(sha512, MASTER_SECRET, seed)

  const privateKey = masterKeyAndChainCodeBuffer.slice(0, 32)
  const chainCode = masterKeyAndChainCodeBuffer.slice(32)

  const masterNode = bip32.fromPrivateKey(
    Buffer.from(privateKey),
    Buffer.from(chainCode),
    BITCOIN
  )

  sodium_memzero(masterKeyAndChainCodeBuffer)
  sodium_memzero(privateKey)
  sodium_memzero(chainCode)

  return masterNode
}

/**
 * Interface for Bitcoin signers, extending the base {@link ISigner} from `@tetherto/wdk-wallet`
 * @extends {ISigner}
 * @interface
 */
export class ISignerBtc extends ISigner {
  /**
   * Whether this signer can derive child signers.
   *
   * @type {boolean}
   */
  get isDerivable () {
    throw new NotImplementedError('isDerivable')
  }

  /**
   * The derivation path index of this account, when applicable.
   *
   * @type {number | undefined}
   */
  get index () {
    throw new NotImplementedError('index')
  }

  /**
   * The full derivation path of this account, when applicable.
   *
   * @type {string | undefined}
   */
  get path () {
    throw new NotImplementedError('path')
  }

  /**
   * The account's key pair (public and private keys).
   *
   * @type {KeyPair}
   */
  get keyPair () {
    throw new NotImplementedError('keyPair')
  }

  /**
   * The wallet configuration.
   *
   * @type {BtcWalletConfig}
   */
  get config () {
    throw new NotImplementedError('config')
  }

  /**
   * The account's Bitcoin address, when available.
   *
   * @type {string | undefined}
   */
  get address () {
    throw new NotImplementedError('address')
  }

  /**
   * Derives a child signer from the current signer, using the same configuration.
   *
   * @param {string} relPath - The relative derivation path.
   * @returns {Promise<ISignerBtc>} The derived child signer.
   * @throws {SignerError} If the signer does not support derivation.
   */
  async derive (relPath) {
    throw new NotImplementedError('derive(relPath)')
  }

  /**
   * Returns the extended public key (xpub/zpub).
   *
   * @returns {Promise<string>} The extended public key.
   */
  async getExtendedPublicKey () {
    throw new NotImplementedError('getExtendedPublicKey()')
  }

  /**
   * Signs a message.
   *
   * @param {string} message - The message to sign.
   * @returns {Promise<string>} The signature in base64 format.
   */
  async sign (message) {
    throw new NotImplementedError('sign(message)')
  }

  /**
   * Verifies a message signature.
   *
   * @param {string} message - The original message.
   * @param {string} signature - The signature to verify.
   * @returns {Promise<boolean>} True if the signature is valid.
   */
  async verify (message, signature) {
    throw new NotImplementedError('verify(message, signature)')
  }

  /**
   * Signs a PSBT (Partially Signed Bitcoin Transaction).
   *
   * @param {Psbt | string} psbt - The PSBT instance or base64 string.
   * @returns {Promise<string>} The signed PSBT in base64 format.
   */
  async signPsbt (psbt) {
    throw new NotImplementedError('signPsbt(psbt)')
  }

  /**
   * Disposes the signer, securely erasing sensitive data from memory.
   */
  dispose () {
    throw new NotImplementedError('dispose()')
  }
}

/**
 * HD signer backed by a BIP39 seed phrase or seed buffer.
 *
 * @implements {ISignerBtc}
 */
export default class SeedSignerBtc {
  /**
   * Creates a new seed-based signer.
   *
   * @param {string | Buffer} seed - The seed phrase (mnemonic) or seed buffer.
   * @param {BtcWalletConfig} [config] - The wallet configuration.
   * @param {Object} [opts] - Internal options.
   * @param {BIP32Interface} [opts.masterNode] - Pre-derived master node (e.g. from an extended private key).
   * @param {string} [opts.path] - Relative derivation path of the account (default: "0'/0/0").
   * @param {boolean} [opts.isChild] - When true, the signer is a derived child and does not retain the
   *   master node, so it cannot derive further.
   */
  constructor (seed, config = {}, opts = {}) {
    config = normalizeConfig(config)
    /**
     * The wallet account configuration.
     *
     * @protected
     * @type {BtcWalletConfig}
     */
    this._config = config
    /** @private */
    this._bip = config.bip

    let masterNode
    if (opts.masterNode) {
      masterNode = opts.masterNode
    } else {
      if (typeof seed === 'string') {
        if (!bip39.validateMnemonic(seed)) {
          throw new Error('The seed phrase is invalid.')
        }
        seed = bip39.mnemonicToSeedSync(seed)
      }
      masterNode = deriveMasterNode(seed)
    }

    // Every signer holds an account; default to "0'/0/0" so it can always back a wallet account.
    const netdp = config.network === 'bitcoin' ? 0 : 1
    const fullPath = `m/${config.bip}'/${netdp}'/${opts.path || "0'/0/0"}`
    const account = masterNode.derivePath(fullPath)
    const network = networks[config.network] || networks.testnet

    /** @private */
    this._account = account
    /** @private */
    this._path = fullPath
    /** @private */
    this._address = getAddressFromPublicKey(account.publicKey, network, config.bip)
    // A root signer retains the master node and can derive children; a derived child drops it.
    /** @private */
    this._masterNode = opts.isChild ? undefined : masterNode
  }

  /**
   * Creates a signer from an extended private key (xprv/tprv).
   *
   * @param {string} xprv - The extended private key in base58 format.
   * @param {BtcWalletConfig} [config] - The wallet configuration.
   * @returns {SeedSignerBtc} The signer instance.
   */
  static fromXprv (xprv, config = {}) {
    const network = networks[config.network] || networks.testnet
    const masterNode = bip32.fromBase58(xprv, network)
    return new SeedSignerBtc(null, config, { masterNode })
  }

  /**
   * Whether this signer can derive child signers.
   *
   * @type {boolean}
   */
  get isDerivable () {
    return Boolean(this._masterNode)
  }

  /**
   * The derivation path index of this account.
   *
   * @type {number | undefined}
   */
  get index () {
    if (!this._path) return undefined
    return +this._path.split('/').pop()
  }

  /**
   * The derivation path of this account.
   *
   * @type {string | undefined}
   */
  get path () {
    return this._path
  }

  /**
   * The account's key pair.
   *
   * @type {KeyPair}
   */
  get keyPair () {
    const src = this._account || this._masterNode
    if (!src) return { privateKey: null, publicKey: null }
    return {
      privateKey: src.privateKey || null,
      publicKey: src.publicKey || null
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
   * Derives a detached child signer from the current root signer.
   *
   * @param {string} relPath - The relative derivation path (e.g., "0'/0/0").
   * @returns {Promise<SeedSignerBtc>} The derived child signer.
   * @throws {SignerError} If this signer has no master node (it is a derived child or has been disposed).
   */
  async derive (relPath) {
    if (!this._masterNode) {
      throw new SignerError('Cannot derive: this signer has no master node (it is a derived child or has been disposed).')
    }
    return new SeedSignerBtc(null, this._config, { masterNode: this._masterNode, path: relPath, isChild: true })
  }

  /**
   * Returns the extended public key (xpub/zpub/tpub/vpub based on network and BIP).
   *
   * @returns {Promise<string>} The extended public key in base58 format.
   */
  async getExtendedPublicKey () {
    const network = networks[this._config.network] || networks.testnet
    const src = this._account.neutered()
    const node = bip32.fromPublicKey(
      Buffer.from(src.publicKey),
      Buffer.from(src.chainCode),
      network
    )
    node.depth = src.depth
    node.index = src.index
    node.parentFingerprint = src.parentFingerprint

    return node.toBase58()
  }

  /**
   * Signs a PSBT (Partially Signed Bitcoin Transaction).
   *
   * @param {Psbt | string} psbt - The PSBT instance or base64 string.
   * @returns {Promise<string>} The signed PSBT in base64 format.
   */
  async signPsbt (psbt) {
    const psbtInstance =
      typeof psbt === 'string' ? Psbt.fromBase64(psbt) : psbt

    // Every signer holds a leaf account (a root defaults to "0'/0/0"), so we sign directly with it.
    const network = networks[this._config.network] || networks.testnet
    return signPsbtWithKey(psbtInstance, this._account, this._bip, network)
  }

  /**
   * Signs a message.
   *
   * @param {string} message - The message to sign.
   * @returns {Promise<string>} The message's signature.
   */
  async sign (message) {
    return signMessage(message, this._account.privateKey, this._bip)
  }

  /**
   * Disposes the signer, securely erasing private keys from memory.
   */
  dispose () {
    if (this._account) {
      if (this._account.privateKey) {
        sodium_memzero(this._account.privateKey)
        Object.defineProperty(this._account, 'privateKey', {
          get: () => null,
          configurable: true
        })
      }
      if (this._account.chainCode) {
        sodium_memzero(this._account.chainCode)
      }
    }

    if (this._masterNode) {
      sodium_memzero(this._masterNode.privateKey)
      sodium_memzero(this._masterNode.chainCode)
    }
    this._masterNode = undefined
  }
}
