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
import { networks, Psbt } from 'bitcoinjs-lib'
import { ValueError } from '@tetherto/wdk-wallet'

import * as bip39 from 'bip39'

// eslint-disable-next-line camelcase
import { sodium_memzero } from 'sodium-universal'

import { BIP32 } from '../crypto-engine.js'
import {
  DEFAULT_ADDRESS_TYPE,
  getAddressFromPublicKey,
  signMessage,
  signPsbtWithKey
} from './utils.js'

/** @typedef {import('./signer-btc.js').ISignerBtc} ISignerBtc */
/** @typedef {import('./signer-btc.js').BtcSignerConfig} BtcSignerConfig */
/** @typedef {import('../primitives/index.js').ScriptType} ScriptType */
/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('bip32').BIP32Interface} BIP32Interface */
/** @typedef {import('bitcoinjs-lib').Network} Network */

const MASTER_SECRET = Buffer.from('Bitcoin seed', 'utf8')

const BITCOIN = {
  wif: 0x80,
  bip32: { public: 0x0488b21e, private: 0x0488ade4 },
  messagePrefix: '\x18Bitcoin Signed Message:\n',
  bech32: 'bc',
  pubKeyHash: 0x00,
  scriptHash: 0x05
}

/**
 * Returns the relative BIP derivation path prefix (purpose'/coin_type') for the given signer
 * configuration.
 *
 * @internal
 * @param {BtcSignerConfig} [config] - The signer configuration.
 * @returns {string} The derivation path prefix (e.g. "84'/0'").
 */
export function getBtcDerivationPathPrefix (config = {}) {
  const { network, type = DEFAULT_ADDRESS_TYPE } = config
  return `${type === 'legacy' ? 44 : 84}'/${network === 'bitcoin' ? 0 : 1}'`
}

/**
 * Derives the BIP32 master node from a seed buffer, securely erasing the intermediate key
 * material once the node is built. The node carries the given network's version bytes, so any
 * extended keys serialized from it (xpub/tpub) reflect the configured network.
 *
 * @param {Buffer} seed - The seed buffer.
 * @param {Network} [network] - The network whose version bytes the node should carry (default: bitcoin mainnet).
 * @returns {BIP32Interface} The master node.
 */
function deriveMasterNode (seed, network = BITCOIN) {
  const masterKeyAndChainCodeBuffer = hmac(sha512, MASTER_SECRET, seed)

  const privateKey = masterKeyAndChainCodeBuffer.slice(0, 32)
  const chainCode = masterKeyAndChainCodeBuffer.slice(32)

  const masterNode = BIP32.fromPrivateKey(
    Buffer.from(privateKey),
    Buffer.from(chainCode),
    network
  )

  sodium_memzero(masterKeyAndChainCodeBuffer)
  sodium_memzero(privateKey)
  sodium_memzero(chainCode)

  return masterNode
}

/**
 * Signer implementation that derives keys from a BIP-39 seed using an HD path.
 *
 * The path is not required to match the configured BIP purpose; the configuration governs
 * address encoding only.
 *
 * @implements {ISignerBtc}
 */
export default class SeedSignerBtc {
  /** @private */
  _config

  /** @private */
  _account

  /** @private */
  _path

  /** @private */
  _publicKey

  /** @private */
  _masterFingerprint

  /** @private */
  _address

  /**
   * Creates a SeedSignerBtc from a BIP-39 seed.
   *
   * @param {string | Uint8Array} seed - BIP-39 mnemonic or seed bytes.
   * @param {string} [path] - A BIP-32 path (default: the coin-type node for the configured address type and network, e.g. "m/84'/0'").
   * @param {BtcSignerConfig} [config] - The signer configuration.
   * @throws {ValueError} If the given seed phrase is invalid.
   */
  constructor (seed, path, config = {}) {
    // Seed bytes derived from a mnemonic are ours to erase; caller-supplied bytes are never touched.
    const ownsSeed = typeof seed === 'string'
    if (ownsSeed) {
      if (!bip39.validateMnemonic(seed)) {
        throw new ValueError('The seed phrase is invalid.')
      }

      seed = bip39.mnemonicToSeedSync(seed)
    }

    path = path ?? `m/${getBtcDerivationPathPrefix(config)}`

    const network = networks[config.network] || networks.bitcoin
    const root = deriveMasterNode(seed, network)
    const masterFingerprint = Buffer.from(root.fingerprint).toString('hex')
    if (ownsSeed) {
      sodium_memzero(seed)
    }
    // derivePath rejects the bare "m" path; the root itself is the account in that case. Scrub
    // the master key whenever the signer sits below it, including when derivation throws, so no
    // signer (or failed construction) keeps the root alive.
    let account
    try {
      account = path === 'm' ? root : root.derivePath(path)
    } finally {
      if (account !== root) {
        sodium_memzero(root.privateKey)
        sodium_memzero(root.chainCode)
      }
    }
    SeedSignerBtc._init(this, account, config, path, masterFingerprint)
  }

  /**
   * Creates a signer from an extended private key (xprv/tprv). The imported node is the
   * signer's root, at path "/": a relative root whose prefix below the master key is unknown.
   *
   * @param {string} xprv - The extended private key in base58 format.
   * @param {BtcSignerConfig} [config] - The signer configuration.
   * @returns {SeedSignerBtc} The signer instance.
   * @throws {ValueError} If the given key is an extended public key (xpub/tpub) rather than an extended private key.
   */
  static fromXprv (xprv, config = {}) {
    const network = networks[config.network] || networks.bitcoin
    const node = BIP32.fromBase58(xprv, network)
    if (node.isNeutered()) {
      throw new ValueError('The given key is an extended public key; an extended private key (xprv/tprv) is required.')
    }
    const signer = Object.create(SeedSignerBtc.prototype)
    SeedSignerBtc._init(signer, node, config, '/', node.depth === 0 ? Buffer.from(node.fingerprint).toString('hex') : undefined)
    return signer
  }

  /**
   * Whether this signer can derive child signers. Always true: every seed signer holds an
   * HD node with a private key and can derive below its own path.
   *
   * @type {true}
   */
  get isDerivable () {
    return true
  }

  /**
   * The signer's absolute derivation path.
   *
   * @type {string}
   */
  get path () {
    return this._path
  }

  /**
   * The fingerprint of the master key (BIP-32) as 8 lowercase hex characters, if known: the first
   * four bytes of the HASH160 of the master public key. Undefined for signers imported from a
   * non-root extended private key, whose master key is unknown.
   *
   * @type {string | undefined}
   */
  get masterFingerprint () {
    return this._masterFingerprint
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
   * @type {ScriptType}
   */
  get type () {
    return this._config.type ?? DEFAULT_ADDRESS_TYPE
  }

  /**
   * The account's key pair (private and public key buffers).
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
   * Derives a child signer relative to this signer's own path (e.g. calling derive("0'/0/1") on
   * a signer at "m/84'/0'" yields a child at "m/84'/0'/0'/0/1")
   *
   * @param {string} relPath - The path segment to derive, relative to this signer's own path.
   * @returns {Promise<SeedSignerBtc>} The derived child signer.
   */
  async derive (relPath) {
    const signer = Object.create(SeedSignerBtc.prototype)
    const path = this._path === '/' ? `/${relPath}` : `${this._path}/${relPath}`
    SeedSignerBtc._init(signer, this._account.derivePath(relPath), this._config, path, this._masterFingerprint)
    return signer
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
   * Returns the extended public key of the signer's node (xpub on mainnet, tpub on testnet and regtest).
   *
   * @returns {Promise<string>} The extended public key in base58 format.
   */
  async getExtendedPublicKey () {
    return this._account.neutered().toBase58()
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
   * Disposes the signer, securely erasing its private key from memory.
   */
  dispose () {
    if (this._account) {
      sodium_memzero(this._account.privateKey)
      sodium_memzero(this._account.chainCode)
    }
    this._account = undefined
  }

  /** @private */
  static _init (signer, account, config, path, masterFingerprint) {
    const network = networks[config.network] || networks.bitcoin
    signer._config = config
    signer._account = account
    signer._path = path
    signer._publicKey = account.publicKey
    signer._masterFingerprint = masterFingerprint
    signer._address = getAddressFromPublicKey(account.publicKey, network, signer.type)
  }
}
