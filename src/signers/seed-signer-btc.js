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
import { ValueError } from '@tetherto/wdk-wallet'

import * as bip39 from 'bip39'
import * as ecc from '@bitcoinerlab/secp256k1'

// eslint-disable-next-line camelcase
import { sodium_memzero } from 'sodium-universal'

import {
  normalizeConfig,
  getAddressFromPublicKey,
  signMessage,
  signPsbtWithKey
} from './utils.js'

/** @typedef {import('./signer-btc.js').ISignerBtc} ISignerBtc */
/** @typedef {import('./signer-btc.js').BtcSignerConfig} BtcSignerConfig */
/** @typedef {import('./signer-btc.js').BtcAddressType} BtcAddressType */
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
const bip32 = BIP32Factory(ecc)

initEccLib(ecc)

/**
 * Returns the relative BIP derivation path prefix (purpose'/coin_type') for the given signer
 * configuration.
 *
 * @internal
 * @param {BtcSignerConfig} [config] - The signer configuration.
 * @returns {string} The derivation path prefix (e.g. "84'/0'").
 * @throws {ValueError} If an unsupported address type is specified.
 */
export function getBtcDerivationPathPrefix (config = {}) {
  const { network, type } = normalizeConfig(config)
  return `${type === 'legacy' ? 44 : 84}'/${network === 'bitcoin' ? 0 : 1}'`
}

/**
 * Derives the BIP32 master node from a seed buffer, securely erasing the intermediate key
 * material once the node is built. The node carries the given network's version bytes, so any
 * extended keys serialized from it (xpub/tpub) reflect the configured network.
 *
 * @internal
 * @param {Buffer} seed - The seed buffer.
 * @param {Network} [network] - The network whose version bytes the node should carry (default: bitcoin mainnet).
 * @returns {BIP32Interface} The master node.
 */
function deriveMasterNode (seed, network = BITCOIN) {
  const masterKeyAndChainCodeBuffer = hmac(sha512, MASTER_SECRET, seed)

  const privateKey = masterKeyAndChainCodeBuffer.slice(0, 32)
  const chainCode = masterKeyAndChainCodeBuffer.slice(32)

  const masterNode = bip32.fromPrivateKey(
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
  _network

  /** @private */
  _account

  /** @private */
  _path

  /** @private */
  _publicKey

  /** @private */
  _address

  /**
   * Creates a SeedSignerBtc from a BIP-39 seed.
   *
   * @param {string | Uint8Array} seed - BIP-39 mnemonic or seed bytes.
   * @param {string} [path] - A BIP-32 path (default: the first account for the configured address type and network, e.g. "m/84'/0'/0'/0/0").
   * @param {BtcSignerConfig} [config] - The signer configuration.
   * @throws {ValueError} If the given seed phrase is invalid, or an unsupported address type is specified.
   */
  constructor (seed, path, config = {}) {
    if (typeof seed === 'string') {
      if (!bip39.validateMnemonic(seed)) {
        throw new ValueError('The seed phrase is invalid.')
      }

      seed = bip39.mnemonicToSeedSync(seed)
    }

    config = normalizeConfig(config)
    path = path ?? `m/${getBtcDerivationPathPrefix(config)}/0'/0/0`

    const network = networks[config.network] || networks.bitcoin
    const root = deriveMasterNode(seed, network)
    // derivePath rejects the bare "m" path; the root itself is the account in that case. Scrub
    // the master key whenever the signer sits below it, so no signer keeps the root alive.
    const account = path === 'm' ? root : root.derivePath(path)
    if (account !== root) {
      sodium_memzero(root.privateKey)
      sodium_memzero(root.chainCode)
    }
    SeedSignerBtc._init(this, account, config, path)
  }

  /**
   * Creates a signer from an extended private key (xprv/tprv). The imported node is the
   * signer's root, at path "/": a relative root whose prefix below the master key is unknown.
   *
   * @param {string} xprv - The extended private key in base58 format.
   * @param {BtcSignerConfig} [config] - The signer configuration.
   * @returns {SeedSignerBtc} The signer instance.
   * @throws {ValueError} If an unsupported address type is specified.
   */
  static fromXprv (xprv, config = {}) {
    config = normalizeConfig(config)
    const network = networks[config.network] || networks.bitcoin
    const node = bip32.fromBase58(xprv, network)
    const signer = Object.create(SeedSignerBtc.prototype)
    SeedSignerBtc._init(signer, node, config, '/')
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
    return this._config.network ?? 'bitcoin'
  }

  /**
   * The address type of the signer's addresses ("legacy" for P2PKH, "segwit" for P2WPKH).
   *
   * @type {BtcAddressType}
   */
  get type () {
    return this._config.type
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
    SeedSignerBtc._init(signer, this._account.derivePath(relPath), this._config, path)
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
   * Returns the extended public key (xpub/zpub/tpub/vpub based on network and BIP).
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
    return signMessage(message, this._account.privateKey, this._config.type)
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
  static _init (signer, account, config, path) {
    signer._config = config
    signer._network = networks[config.network] || networks.bitcoin
    signer._account = account
    signer._path = path
    signer._publicKey = account.publicKey
    signer._address = getAddressFromPublicKey(account.publicKey, signer._network, config.type)
  }
}
