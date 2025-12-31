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
import { sha512 } from '@noble/hashes/sha512'
import { initEccLib, networks, Psbt } from 'bitcoinjs-lib'
import { BIP32Factory } from 'bip32'
import { NotImplementedError } from '@tetherto/wdk-wallet'

import * as bip39 from 'bip39'
import * as ecc from '@bitcoinerlab/secp256k1'

// eslint-disable-next-line camelcase
import { sodium_memzero } from 'sodium-universal'

/** @typedef {import('@tetherto/wdk-wallet/src/isigner.js').ISigner} ISigner */
/** @typedef {import('../wallet-account-read-only-btc.js').BtcWalletConfig} BtcWalletConfig */
/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */

import {
  buildPaymentScript,
  detectInputOwnership,
  ensureWitnessUtxoIfNeeded,
  normalizeConfig,
  getAddressFromPublicKey,
  signMessage
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
 * Interface for Bitcoin signers.
 * @implements {ISigner}
 * @interface
 */
export class ISignerBtc {
  /**
   * The derivation path index of this account.
   *
   * @type {number}
   */
  get index () {
    throw new NotImplementedError('index')
  }

  /**
   * The full derivation path of this account.
   *
   * @type {string}
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
   * The account's Bitcoin address.
   *
   * @type {string}
   */
  get address () {
    throw new NotImplementedError('address')
  }

  /**
   * Derives a child signer from the current signer.
   *
   * @param {string} relPath - The relative derivation path.
   * @param {BtcWalletConfig} [config] - Optional configuration overrides.
   * @returns {ISignerBtc} The derived child signer.
   */
  derive (relPath, config = {}) {
    throw new NotImplementedError('derive(relPath, config)')
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
   * @param {import('bip32').BIP32Interface} [opts.masterNode] - Pre-derived master node.
   * @param {string} [opts.path] - Derivation path relative to BIP root.
   */
  constructor (seed, config = {}, opts = {}) {
    if (typeof seed === 'string') {
      if (!bip39.validateMnemonic(seed)) {
        throw new Error('The seed phrase is invalid.')
      }
      seed = bip39.mnemonicToSeedSync(seed)
    }

    // TODO: add support for privKey import
    let masterNode
    if (opts.masterNode) {
      masterNode = opts.masterNode
    } else {
      masterNode = deriveMasterNode(seed)
    }

    this._masterNode = masterNode
    this._isActive = true
    this._bip = undefined
    this._path = undefined
    this._account = undefined
    this._address = undefined
    /**
     * The wallet account configuration.
     *
     * @protected
     * @type {BtcWalletConfig}
     */
    config = normalizeConfig(config)
    this._config = config
    this._isRoot = true

    if (opts.path) {
      const netdp = config.network === 'bitcoin' ? 0 : 1
      const fullPath = `m/${config.bip}'/${netdp}'/${opts.path}`
      const account = masterNode.derivePath(fullPath)
      const network = networks[config.network] || networks.testnet
      const address = getAddressFromPublicKey(
        account.publicKey,
        network,
        config.bip
      )

      this._path = fullPath

      this._bip = config.bip

      this._masterNode = masterNode

      /** @private */
      this._account = account

      this._address = address

      this._isRoot = false
    }
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
   * Whether this is the root (underived) signer.
   *
   * @type {boolean}
   */
  get isRoot () {
    return this._isRoot
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
   * The derivation path index of this account.
   *
   * @type {number}
   */
  get index () {
    return +this._path.split('/').pop()
  }

  /**
   * The derivation path of this account.
   *
   * @type {string}
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
    return {
      privateKey: this._account.privateKey ? new Uint8Array(this._account.privateKey) : null,
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
   * Derives a child signer from the current signer.
   *
   * @param {string} relPath - The relative derivation path (e.g., "0'/0/0").
   * @param {BtcWalletConfig} [config] - Optional configuration overrides.
   * @returns {SeedSignerBtc} The derived child signer.
   */
  derive (relPath, config = {}) {
    const cfg = {
      ...this._config,
      ...Object.fromEntries(
        Object.entries(config || {}).filter(([, v]) => v !== undefined)
      )
    }
    // Recreate a fresh root from the same material; no manual field assignment needed
    const cloned = bip32.fromPrivateKey(
      Buffer.from(this._masterNode.privateKey),
      Buffer.from(this._masterNode.chainCode),
      BITCOIN
    )
    const opts = {
      masterNode: cloned,
      path: relPath
    }

    return new SeedSignerBtc(null, cfg, opts)
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

    const pubkey = this._account && this._account.publicKey
    if (!pubkey) return psbtInstance.toBase64()

    const network = networks[this._config.network] || networks.testnet
    const myScript = buildPaymentScript(this._bip, pubkey, network)

    for (let i = 0; i < psbtInstance.inputCount; i++) {
      const { input, prevOut, isOurs } = detectInputOwnership(
        psbtInstance,
        i,
        myScript
      )

      if (!isOurs) continue

      try {
        // Ensure bip32Derivation is present so we can use signInputHD
        const hasDerivation = (input.bip32Derivation || []).some(
          (d) =>
            d &&
            d.pubkey &&
            Buffer.isBuffer(d.pubkey) &&
            d.pubkey.equals(pubkey)
        )
        if (!hasDerivation) {
          psbtInstance.updateInput(i, {
            bip32Derivation: [
              {
                masterFingerprint: this._masterNode.fingerprint,
                path: this.path,
                pubkey
              }
            ]
          })
        }

        // For BIP84, prefer witnessUtxo if we can derive it from prevOut
        ensureWitnessUtxoIfNeeded(psbtInstance, i, this._bip, prevOut, input)

        psbtInstance.signInputHD(i, this._masterNode)
      } catch (err) {
        // Ignore inputs we cannot sign (e.g., finalized or missing data)
      }
    }

    // Do not finalize here to support partially signed workflows
    return psbtInstance.toBase64()
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
      sodium_memzero(this._account.privateKey)
      sodium_memzero(this._account.chainCode)
    }

    sodium_memzero(this._masterNode.privateKey)
    sodium_memzero(this._masterNode.chainCode)

    this._masterNode = undefined
    this._isActive = false
    Object.defineProperty(this._account, 'privateKey', {
      get: () => null
    })
  }
}
