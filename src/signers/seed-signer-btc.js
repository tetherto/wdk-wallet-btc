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
import { crypto, initEccLib, networks, payments, Psbt, Transaction } from 'bitcoinjs-lib'
import { BIP32Factory } from 'bip32'

import * as bip39 from 'bip39'
import * as ecc from '@bitcoinerlab/secp256k1'

// eslint-disable-next-line camelcase
import { sodium_memzero } from 'sodium-universal'

/**
 * @typedef {Object} BtcTransfer
 * @property {string} txid - The transaction's id.
 * @property {string} address - The user's own address.
 * @property {number} vout - The index of the output in the transaction.
 * @property {number} height - The block height (if unconfirmed, 0).
 * @property {number} value - The value of the transfer (in satoshis).
 * @property {"incoming" | "outgoing"} direction - The direction of the transfer.
 * @property {number} [fee] - The fee paid for the full transaction (in satoshis).
 * @property {string} [recipient] - The receiving address for outgoing transfers.
 */

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

function derivePath (seed, path) {
  const masterKeyAndChainCodeBuffer = hmac(sha512, MASTER_SECRET, seed)

  const privateKey = masterKeyAndChainCodeBuffer.slice(0, 32)
  const chainCode = masterKeyAndChainCodeBuffer.slice(32)

  const masterNode = bip32.fromPrivateKey(Buffer.from(privateKey), Buffer.from(chainCode), BITCOIN)
  const account = masterNode.derivePath(path)

  sodium_memzero(masterKeyAndChainCodeBuffer)
  sodium_memzero(privateKey)
  sodium_memzero(chainCode)

  return { masterNode, account }
}

// TODO: generate JSDoc and create types for this interface, export it in package.json
/** @interface */
export class  {
  get index () {
    throw new Error('Not implemented')
  }

  get path () {
    throw new Error('Not implemented')
  }

  get keyPair () {
    throw new Error('Not implemented')
  }

  get config () {
    throw new Error('Not implemented')
  }

  get address () {
    throw new Error('Not implemented')
  }

  async getExtendedPublicKey () {
    throw new Error('Not implemented')
  }

  async sign (message) {
    throw new Error('Not implemented')
  }

  async verify (message, signature) {
    throw new Error('Not implemented')
  }

  async getWalletAddress () {
    throw new Error('Not implemented')
  }

  async signPsbt (psbt) {
    throw new Error('Not implemented')
  }
}

/** @typedef {import('../wallet-account-read-only-btc.js').BtcWalletConfig} BtcWalletConfig */
export default class SeedSignerBtc {
  constructor (seed, path, config) {
    if (typeof seed === 'string') {
      if (!bip39.validateMnemonic(seed)) {
        throw new Error('The seed phrase is invalid.')
      }
      seed = bip39.mnemonicToSeedSync(seed)
    }

    const bip = config.bip ?? 44
    if (![44, 84].includes(bip)) {
      throw new Error('Invalid bip specification. Supported bips: 44, 84.')
    }

    const netdp = config.network === 'testnet' ? 1 : 0
    const fullPath = `m/${bip}'/${netdp}'/${path}`

    const { masterNode, account } = derivePath(seed, fullPath)

    const network = networks[config.network] || networks.bitcoin
    const { address } = bip === 44
      ? payments.p2pkh({ pubkey: account.publicKey, network: network })
      : payments.p2wpkh({ pubkey: account.publicKey, network: network })

    /**
     * The wallet account configuration.
     *
     * @protected
     * @type {BtcWalletConfig}
     */
    this._config = config

    this._path = fullPath

    this._bip = bip

    this._masterNode = masterNode

    /** @private */
    this._account = account

    this._address = address
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

  async getExtendedPublicKey () {
    const isTestnet = this._config.network === 'testnet' || this._config.network === 'regtest'
    const versions = isTestnet
      ? {
          44: { public: 0x043587cf, private: 0x04358394 }, // tpub/tprv
          84: { public: 0x045f1cf6, private: 0x045f18bc } // vpub/vprv
        }
      : {
          44: { public: 0x0488b21e, private: 0x0488ade4 }, // xpub/xprv
          84: { public: 0x04b24746, private: 0x04b2430c } // zpub/zprv
        }

    const { public: publicVersion, private: privateVersion } = versions[this._bip]
    const network = {
      wif: isTestnet ? 0xef : 0x80,
      bip32: { public: publicVersion, private: privateVersion }
    }

    const src = this._account.neutered()
    const node = bip32.fromPublicKey(Buffer.from(src.publicKey), Buffer.from(src.chainCode), network)
    node.depth = src.depth
    node.index = src.index
    node.parentFingerprint = src.parentFingerprint

    return node.toBase58()
  }

  async getWalletAddress () {
    throw new Error('Method implemented only in Signers with transport layer')
  }

  async signPsbt (psbt) {
    const psbtInstance = typeof psbt === 'string' ? Psbt.fromBase64(psbt) : psbt

    const pubkey = this._account && this._account.publicKey
    if (!pubkey) return psbtInstance.toBase64()

    // Build our payment script based on BIP (44 -> p2pkh, 84 -> p2wpkh)
    const payment = this._bip === 84
      ? payments.p2wpkh({ pubkey })
      : payments.p2pkh({ pubkey })
    const myScript = payment.output

    for (let i = 0; i < psbtInstance.inputCount; i++) {
      const input = psbtInstance.data.inputs[i] || {}
      const txIn = psbtInstance.txInputs[i]
      let prevOut = null
      let isOurs = false

      try {
        if (input.nonWitnessUtxo) {
          const prevTx = Transaction.fromBuffer(input.nonWitnessUtxo)
          prevOut = prevTx.outs[txIn.index]
          isOurs = !!(prevOut && prevOut.script && myScript && prevOut.script.equals(myScript))
        } else if (input.witnessUtxo) {
          prevOut = input.witnessUtxo
          isOurs = !!(prevOut && prevOut.script && myScript && prevOut.script.equals(myScript))
        }
      } catch (err) {
        // If we cannot parse/compare, skip this input
        isOurs = false
      }

      if (!isOurs) continue

      // Ensure bip32Derivation is present so we can use signInputHD
      try {
        const hasDerivation = (input.bip32Derivation || []).some(d =>
          d && d.pubkey && Buffer.isBuffer(d.pubkey) && d.pubkey.equals(pubkey)
        )
        if (!hasDerivation) {
          psbtInstance.updateInput(i, {
            bip32Derivation: [{
              masterFingerprint: this._masterNode.fingerprint,
              path: this.path,
              pubkey
            }]
          })
        }

        // For BIP84, prefer witnessUtxo if we can derive it from prevOut
        if (this._bip === 84 && prevOut && prevOut.script && typeof prevOut.value === 'number' && !input.witnessUtxo) {
          psbtInstance.updateInput(i, {
            witnessUtxo: {
              script: prevOut.script,
              value: prevOut.value
            }
          })
        }

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
    const messageHash = crypto.sha256(Buffer.from(message, 'utf8'))
    return this._account.sign(messageHash).toString('hex')
  }

  /**
   * Verifies a message's signature.
   *
   * @param {string} message - The original message.
   * @param {string} signature - The signature to verify.
   * @returns {Promise<boolean>} True if the signature is valid.
   */
  async verify (message, signature) {
    const messageHash = crypto.sha256(Buffer.from(message, 'utf8'))
    const signatureBuffer = Buffer.from(signature, 'hex')
    return this._account.verify(messageHash, signatureBuffer)
  }

  dispose () {
    sodium_memzero(this._account.privateKey)
    sodium_memzero(this._account.chainCode)

    sodium_memzero(this._masterNode.privateKey)
    sodium_memzero(this._masterNode.chainCode)

    this._account = undefined

    this._masterNode = undefined
  }
}
