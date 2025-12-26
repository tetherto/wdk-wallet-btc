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
  DeviceManagementKitBuilder,
  DeviceStatus
} from '@ledgerhq/device-management-kit'
import { webHidTransportFactory } from '@ledgerhq/device-transport-kit-web-hid'
import {
  DefaultDescriptorTemplate,
  DefaultWallet,
  SignerBtcBuilder
} from '@ledgerhq/device-signer-kit-bitcoin'
import { networks } from 'bitcoinjs-lib'
import { BIP32Factory } from 'bip32'
import * as ecc from '@bitcoinerlab/secp256k1'
import { filter, firstValueFrom, map } from 'rxjs'

/** @typedef {import('./seed-signer-btc.js').ISignerBtc} ISignerBtc */
import { getAddressFromPublicKey, normalizeConfig } from './utils.js'

const bip32 = BIP32Factory(ecc)

/**
 * @implements {ISignerBtc}
 */
export default class LedgerSignerBtc {
  constructor (path, config = {}, opts = {}) {
    config = normalizeConfig(config)
    const bip = config.bip

    const netdp = config.network === 'bitcoin' ? 0 : 1
    const fullPath = `m/${bip}'/${netdp}'/${path}`

    /**
     * Device/session state (lazy initialization like EVM signer)
     */
    this._address = undefined
    this._sessionId = ''
    this._signerBtc = undefined
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

    /**
     * @type {import('@ledgerhq/device-management-kit').DeviceManagementKit}
     */
    this._dmk =
      opts.dmk ||
      new DeviceManagementKitBuilder()
        .addTransport(webHidTransportFactory)
        .build()
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

  /**
   * Disconnect current session if any.
   * @private
   */
  async _disconnect () {
    try {
      if (this._signerBtc && this._dmk && this._sessionId) {
        await this._dmk.disconnect({ sessionId: this._sessionId })
      }
    } catch (_) {
      // ignore best-effort disconnect
    } finally {
      this._signerBtc = undefined
      this._sessionId = ''
      this._isActive = false
    }
  }

  /**
   * Reconnect device and refresh signer/address
   *
   * @private
   */
  async _reconnect () {
    if (!this._dmk || !this._sessionId) {
      await this._connect()
      return
    }
    try {
      const device = this._dmk.getConnectedDevice({ sessionId: this._sessionId })
      this._sessionId = await this._dmk.reconnect({
        device,
        sessionRefresherOptions: { isRefresherDisabled: true }
      })
      // Rebuild signer to ensure refreshed handles
      this._signerBtc = new SignerBtcBuilder({
        dmk: this._dmk,
        sessionId: this._sessionId
      }).build()
    } catch (_) {
      // Fallback to full reconnect if soft reconnect fails
      await this._disconnect()
      await this._connect()
    }
  }

  /**
   * Ensure the device is in a usable state before sending actions.
   * - If locked or busy: fail fast with a friendly error.
   * - If not connected: attempt reconnect.
   *
   * @param {string} _context
   * @private
   */
  async _ensureDeviceReady (_context) {
    if (!this._dmk || !this._sessionId) return
    let state
    try {
      state = await firstValueFrom(this._dmk.getDeviceSessionState({ sessionId: this._sessionId }))
    } catch (_) {
      // If state cannot be retrieved, try to reconnect; let subsequent action fail if still unavailable
      await this._reconnect()
      return
    }
    const status = state.deviceStatus
    if (status === DeviceStatus.LOCKED) {
      throw new Error('Device is locked')
    }
    if (status === DeviceStatus.BUSY) {
      throw new Error('Device is busy')
    }
    if (status === DeviceStatus.NOT_CONNECTED) {
      await this._reconnect()
    }
  }

  /**
   * Consume a DeviceAction observable and resolve on Completed; reject early on Error/Stopped.
   *
   * @template T
   * @param {import('rxjs').Observable<any>} observable
   * @returns {Promise<T>}
   * @private
   */
  async _consumeDeviceAction (observable) {
    console.log('Consuming device action inside _consumeDeviceAction')
    const result = await firstValueFrom(
      observable.pipe(
        filter(
          (evt) =>
            evt.status === DeviceActionStatus.Completed ||
            evt.status === DeviceActionStatus.Error ||
            evt.status === DeviceActionStatus.Stopped
        ),
        map((evt) => {
          console.log('Mapping event', evt)
          if (evt.status === DeviceActionStatus.Completed) return evt.output
          if (evt.status === DeviceActionStatus.Error) {
            const err = evt.error || new Error('Unknown Ledger error')
            throw err
          }
          // Stopped → user canceled or device blocked
          throw new Error('Action stopped')
        })
      )
    )
    console.log('Consumed device action', result)
    return result
  }

  /**
   * Discover and connect the device, then hydrate signer/account/address.
   *
   * @private
   */
  async _connect () {
    console.log('Connecting to device')
    // Discover & Connect the device
    const device = await firstValueFrom(this._dmk.startDiscovering({}))
    this._sessionId = await this._dmk.connect({
      device,
      sessionRefresherOptions: { isRefresherDisabled: true }
    })
    console.log('Connected to device')
    // Create a hardware signer
    this._signerBtc = new SignerBtcBuilder({
      dmk: this._dmk,
      sessionId: this._sessionId
    }).build()
    console.log('Created hardware signer')
    // Get the extended pubkey (strip leading "m/")
    try {
      console.log('Getting extended public key')
      // For XPUB, Ledger expects the hardened account-level path only (e.g. "84'/0'/0'")
      const accountLevelPath = this._path.split('/').slice(1, 4).join('/')
      console.log('Account-level path for xpub', accountLevelPath)
      const { observable } = this._signerBtc.getExtendedPublicKey(accountLevelPath, { skipOpenApp: true })
      console.log('Observable', observable)
      const extendedPublicKey = await (async () => {
        console.log('Consuming device action')
        const out = await this._consumeDeviceAction(observable)
        console.log('Consumed device action')
        console.log('Out', out)
        // DMK returns either object {extendedPublicKey} or raw string depending on version
        return typeof out === 'string' ? out : out.extendedPublicKey
      })()
      console.log('Got extended public key')
      console.log(this._config.network)
      // Derive the address
      const network = networks[this._config.network] || networks.bitcoin
      console.log('Network', network)
      const account = bip32.fromBase58(extendedPublicKey)
      console.log('Account', account)
      const address = getAddressFromPublicKey(account.publicKey, network, this._bip)

      // Active
      this._address = address
      this._isActive = true
    } catch (err) {
      await this._disconnect()
      throw err
    }
  }

  /**
   * Derive a new signer at the given relative path, reusing the current device session.
   *
   * @param {string} relPath - Relative BIP-44 path (e.g. "0'/0/1").
   * @param {import('../wallet-account-btc.js').BtcWalletConfig} [cfg]
   * @returns {LedgerSignerBtc}
   */
  derive (relPath, cfg) {
    const mergedCfg = cfg || this._config || {}
    const mergedOpts = { dmk: this._dmk }
    return new LedgerSignerBtc(`${relPath}`, mergedCfg, mergedOpts)
  }

  /** @returns {Promise<string>} */
  async getAddress () {
    console.log('getAddress', this._address)
    await this._ensureDeviceReady('get address')
    if (!this._signerBtc) await this._connect()
    console.log('after connect')
    return this._address
  }

  async signPsbt (psbt) {
    await this._ensureDeviceReady('transaction signing')
    if (!this._signerBtc) await this._connect()

    let accountLevelPath = this._path.split('/').slice(1, 4).join('/')
    if (!accountLevelPath.startsWith('/')) accountLevelPath = `/${accountLevelPath}`

    const { observable } = this._signerBtc.signPsbt(
      new DefaultWallet(
        accountLevelPath,
        this._bip === 44
          ? DefaultDescriptorTemplate.LEGACY
          : DefaultDescriptorTemplate.NATIVE_SEGWIT
      ),
      psbt
    )

    const output = await this._consumeDeviceAction(observable)
    const signatures = Array.isArray(output) ? output : [output]

    for (const psig of signatures) {
      if (psig && 'signature' in psig && typeof psig.inputIndex === 'number') {
        const { pubkey, signature, inputIndex } = psig
        const existing = (psbt.data.inputs[inputIndex] && psbt.data.inputs[inputIndex].partialSig) || []
        const next = [
          ...existing,
          { pubkey: Buffer.from(pubkey), signature: Buffer.from(signature) }
        ]
        psbt.updateInput(inputIndex, { partialSig: next })
      }
      // Ignore MuSig or unsupported outputs for now
    }

    return psbt
  }

  /**
   * Signs a message.
   *
   * @param {string} message - The message to sign.
   * @returns {Promise<string>} The message's signature.
   */
  async sign (message) {
    await this._ensureDeviceReady('message signing')
    if (!this._signerBtc) await this._connect()

    const { observable } = this._signerBtc.signMessage(this._path, message)
    const { r, s, v } = await this._consumeDeviceAction(observable)
    const rHex = String(r).replace(/^0x/i, '').padStart(64, '0')
    const sHex = String(s).replace(/^0x/i, '').padStart(64, '0')
    let recovery = Number(v)
    recovery = recovery === 27 || recovery === 28 ? recovery - 27 : recovery
    const header = 27 + recovery + 4 // compressed
    const sigBuf = Buffer.concat([
      Buffer.from([header]),
      Buffer.from(rHex, 'hex'),
      Buffer.from(sHex, 'hex')
    ])
    return sigBuf.toString('base64')
  }

  /**
   * Verifies a message's signature.
   *
   * @param {string} message - The original message.
   * @param {string} signature - The signature to verify.
   * @returns {Promise<boolean>} True if the signature is valid.
   */
  async verify (message, signature) {
    throw new Error('verify(message, signature) is handled at the wallet-account level for Ledger signers.')
  }

  dispose () {
    this._disconnect()
    this._dmk = undefined
  }
}
