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
// limitations under under the License.
'use strict'

import {
  DeviceActionStatus,
  DeviceManagementKitBuilder
} from '@ledgerhq/device-management-kit'
import { webHidTransportFactory } from '@ledgerhq/device-transport-kit-web-hid'
import {
  DefaultDescriptorTemplate,
  DefaultWallet,
  SignerBtcBuilder
} from '@ledgerhq/device-signer-kit-bitcoin'
import { crypto, networks, payments } from 'bitcoinjs-lib'
import { BIP32Factory } from 'bip32'
import * as ecc from '@bitcoinerlab/secp256k1'
import { filter, firstValueFrom, map } from 'rxjs'

/** @typedef {import('./seed-signer-btc.js').ISignerBtc} ISignerBtc */

const BITCOIN = {
  wif: 0x80,
  bip32: { public: 0x0488b21e, private: 0x0488ade4 },
  messagePrefix: '\x18Bitcoin Signed Message:\n',
  bech32: 'bc',
  pubKeyHash: 0x00,
  scriptHash: 0x05
}

const bip32 = BIP32Factory(ecc)

/**
 * @implements {ISignerBtc}
 */
export default class LedgerSignerBtc {
  constructor (path, config = {}, opts = {}) {
    const bip = config.bip ?? 44
    if (![44, 84].includes(bip)) {
      throw new Error('Invalid bip specification. Supported bips: 44, 84.')
    }

    const netdp = config.network === 'testnet' ? 1 : 0
    const fullPath = `m/${bip}'/${netdp}'/${path}`

    /**
     * Discover & connect a device
     */

    this._dmk =
      opts.dmk ||
      new DeviceManagementKitBuilder()
        .addTransport(webHidTransportFactory)
        .build()

    this._dmk.startDiscovering({}).subscribe({
      next: async (device) => {
        this._sessionId = await this._dmk.connect({
          device,
          sessionRefresherOptions: { isRefresherDisabled: true }
        })

        // Create a hardware signer
        this._signerBtc = new SignerBtcBuilder({
          dmk: this._dmk,
          sessionId: this._sessionId
        }).build()

        // Get the extended pubkey
        const { observable } = this._signerBtc.getExtendedPublicKey(
          fullPath.split('/').splice(1).join('/')
        )
        const xpub = await firstValueFrom(
          observable.pipe(
            filter((evt) => evt.status === DeviceActionStatus.Completed),
            map((evt) => evt.output.extendedPublicKey)
          )
        )

        // Derive the address
        const network = networks[config.network] || networks.bitcoin
        const account = bip32.fromBase58(xpub)
        const { address } =
          bip === 44
            ? payments.p2pkh({ pubkey: account.publicKey, network })
            : payments.p2wpkh({ pubkey: account.publicKey, network })

        // Active
        this._account = account
        this._address = address
        this._isActive = true
      },
      error: (e) => {
        throw new Error(e)
      }
    })

    this._isActive = false

    /**
     * The wallet account configuration.
     *
     * @protected
     * @type {BtcWalletConfig}
     */
    this._config = config

    this._path = fullPath

    this._bip = bip
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

  get config () {
    return this._config
  }

  get address () {
    return this._address
  }

  async signPsbt (psbt) {
    if (!this._signerBtc) throw new Error('Ledger is not connected yet.')

    const accountLevelPath = this._path.split('/').slice(1, 4).join('/')

    const { observable } = this._signerBtc.signTransaction(
      new DefaultWallet(
        accountLevelPath,
        this._bip === 44
          ? DefaultDescriptorTemplate.LEGACY
          : DefaultDescriptorTemplate.NATIVE_SEGWIT
      ),
      psbt
    )

    const [partialSig] = await firstValueFrom(
      observable.pipe(
        filter((evt) => evt.status === DeviceActionStatus.Completed),
        map((evt) => evt.output)
      )
    )

    if ('signature' in partialSig) {
      const { pubkey, signature } = partialSig
      psbt.updateInput(partialSig.inputIndex, {
        partialSig: [
          { pubkey: Buffer.from(pubkey), signature: Buffer.from(signature) }
        ]
      })
      return psbt
    }

    return psbt // not consider other cases in this poc yet
  }

  /**
   * Signs a message.
   *
   * @param {string} message - The message to sign.
   * @returns {Promise<string>} The message's signature.
   */
  async sign (message) {
    if (!this._signerBtc) throw new Error('Ledger is not connected yet.')

    const { observable } = this._signerBtc.signMessage(this._path, message)
    const { r, s } = await firstValueFrom(
      observable.pipe(
        filter((evt) => evt.status === DeviceActionStatus.Completed),
        map((evt) => evt.output)
      )
    )

    return r.replace(/^0x/, '') + s.replace(/^0x/, '')
  }

  /**
   * Verifies a message's signature.
   *
   * @param {string} message - The original message.
   * @param {string} signature - The signature to verify.
   * @returns {Promise<boolean>} True if the signature is valid.
   */
  async verify (message, signature) {
    const data = Buffer.concat([
      Buffer.from(BITCOIN.messagePrefix, 'utf8'),
      Buffer.from([message.length]),
      Buffer.from(message, 'utf8')
    ])

    const messageHash = crypto.sha256(crypto.sha256(data))
    const signatureBuffer = Buffer.from(signature, 'hex')

    return this._account.verify(messageHash, signatureBuffer)
  }

  dispose () {
    this._dmk.disconnect({ sessionId: this._sessionId })

    this._account = undefined

    this._sessionId = ''
    this._signerBtc = undefined
    this._isActive = false
  }
}
