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
import * as bitcoinMessage from 'bitcoinjs-message'
import { NotImplementedError } from '@tetherto/wdk-wallet'

import * as bip39 from 'bip39'
import * as ecc from '@bitcoinerlab/secp256k1'

// eslint-disable-next-line camelcase
import { sodium_memzero } from 'sodium-universal'

import {
  hashMessage,
  buildPaymentScript,
  detectInputOwnership,
  ensureWitnessUtxoIfNeeded,
  normalizeConfig,
  getAddressFromPublicKey
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

// TODO: generate JSDoc and create types for this interface, export it in package.json
/** @interface */
export class ISignerBtc {
  get index () {
    throw new NotImplementedError('index')
  }

  get path () {
    throw new NotImplementedError('path')
  }

  get keyPair () {
    throw new NotImplementedError('keyPair')
  }

  get config () {
    throw new NotImplementedError('config')
  }

  get address () {
    throw new NotImplementedError('address')
  }
  // TODO check this we might need it to be async due to the hardware wallets

  derive (relPath, config = {}) {
    throw new NotImplementedError('derive(relPath, config)')
  }

  async getExtendedPublicKey () {
    throw new NotImplementedError('getExtendedPublicKey()')
  }

  async sign (message) {
    throw new NotImplementedError('sign(message)')
  }

  async verify (message, signature) {
    throw new NotImplementedError('verify(message, signature)')
  }

  async getWalletAddress () {
    throw new NotImplementedError('getWalletAddress()')
  }

  async signPsbt (psbt) {
    throw new NotImplementedError('signPsbt(psbt)')
  }

  dispose () {
    throw new NotImplementedError('dispose()')
  }
}

/** @typedef {import('../wallet-account-read-only-btc.js').BtcWalletConfig} BtcWalletConfig */

/** @implements {ISignerBtc} */
export default class SeedSignerBtc {
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
      const network = networks[config.network] || networks.bitcoin
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

  static fromXprv (xprv, config = {}) {
    const network = networks[config.network] || networks.bitcoin
    const masterNode = bip32.fromBase58(xprv, network)
    return new SeedSignerBtc(null, config, { masterNode })
  }

  get isRoot () {
    return this._isRoot
  }

  get isActive () {
    return this._isActive
  }

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

  get config () {
    return this._config
  }

  get address () {
    return this._address
  }

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

  async getExtendedPublicKey () {
    const isTestnet =
      this._config.network === 'testnet' || this._config.network === 'regtest'
    const versions = isTestnet
      ? {
          44: { public: 0x043587cf, private: 0x04358394 }, // tpub/tprv
          84: { public: 0x045f1cf6, private: 0x045f18bc } // vpub/vprv
        }
      : {
          44: { public: 0x0488b21e, private: 0x0488ade4 }, // xpub/xprv
          84: { public: 0x04b24746, private: 0x04b2430c } // zpub/zprv
        }

    const { public: publicVersion, private: privateVersion } =
      versions[this._bip]
    const network = {
      wif: isTestnet ? 0xef : 0x80,
      bip32: { public: publicVersion, private: privateVersion }
    }

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

  async getWalletAddress () {
    throw new Error('Method implemented only in Signers with transport layer')
  }

  async signPsbt (psbt) {
    const psbtInstance =
      typeof psbt === 'string' ? Psbt.fromBase64(psbt) : psbt

    const pubkey = this._account && this._account.publicKey
    if (!pubkey) return psbtInstance.toBase64()

    const network = networks[this._config.network] || networks.bitcoin
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
   * Verifies a message's signature.
   *
   * @param {string} message - The original message.
   * @param {string} signature - The signature to verify.
   * @returns {Promise<boolean>} True if the signature is valid.
   */
  async verify (message, signature) {
    const messageHash = hashMessage(message)
    const signatureBuffer = Buffer.from(signature, 'hex')
    return this._account.verify(messageHash, signatureBuffer)
  }

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
