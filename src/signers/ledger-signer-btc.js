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
import { filter, firstValueFrom, map } from 'rxjs'
import { networks, payments, Transaction } from 'bitcoinjs-lib'
import { BIP32Factory } from 'bip32'
import * as ecc from '@bitcoinerlab/secp256k1'
import { normalizeConfig } from './utils.js'

const bip32 = BIP32Factory(ecc)

// APDU for GET_MASTER_FINGERPRINT (Bitcoin app)
// CLA=0xE1, INS=0x05, P1=0x00, P2=0x00, no data
const GET_MASTER_FINGERPRINT_APDU = new Uint8Array([0xe1, 0x05, 0x00, 0x00, 0x00])

/** @typedef {import('./seed-signer-btc.js').ISignerBtc} ISignerBtc */

/**
 * @implements {ISignerBtc}
 */
export default class LedgerSignerBtc {
  constructor (path, config = {}, opts = {}) {
    if (config.network === 'regtest') {
      throw new Error('Regtest is not supported for Ledger signer')
    }
    config = normalizeConfig(config)
    const bip = config.bip

    const netdp = config.network === 'bitcoin' ? 0 : 1
    const fullPath = `m/${bip}'/${netdp}'/${path}`
    this.skipOpenApp = netdp === 1

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
   * Ledger-backed signers do not expose private keys; key pairs are not available.
   *
   * @throws {Error} Always throws to indicate unavailability on Ledger.
   */
  get keyPair () {
    throw new Error('Key pair is not available for Ledger signer.')
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
    const result = await firstValueFrom(
      observable.pipe(
        filter(
          (evt) =>
            evt.status === DeviceActionStatus.Completed ||
            evt.status === DeviceActionStatus.Error ||
            evt.status === DeviceActionStatus.Stopped
        ),
        map((evt) => {
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
    return result
  }

  /**
   * Discover and connect the device, then hydrate signer/account/address.
   *
   * @private
   */
  async _connect () {
    // Discover & Connect the device
    const device = await firstValueFrom(this._dmk.startDiscovering({}))
    this._sessionId = await this._dmk.connect({
      device,
      sessionRefresherOptions: { isRefresherDisabled: true }
    })
    // Create a hardware signer
    this._signerBtc = new SignerBtcBuilder({
      dmk: this._dmk,
      sessionId: this._sessionId
    }).build()
    // Hydrate address and cache public key
    try {
      // Derivation pieces
      const parts = this._path.split('/')
      const accountLevelPath = parts.slice(1, 4).join('/') // "84'/0'/0'"
      const changeIndex = Number(parts[4]) // 0 or 1
      const addressIndex = Number(parts[5])
      // 2) Resolve address directly from the device (works for mainnet/testnet apps)
      const wallet = new DefaultWallet(
        accountLevelPath,
        this._bip === 44
          ? DefaultDescriptorTemplate.LEGACY
          : DefaultDescriptorTemplate.NATIVE_SEGWIT
      )
      const { observable: addrObs } = this._signerBtc.getWalletAddress(wallet, Number(addressIndex), {
        change: changeIndex === 1,
        skipOpenApp: this.skipOpenApp
      })
      const addrOut = await this._consumeDeviceAction(addrObs)
      const resolvedAddress = typeof addrOut === 'string' ? addrOut : (addrOut && addrOut.address)
      // Active
      this._address = resolvedAddress
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
    const mergedCfg = {
      ...this._config,
      ...Object.fromEntries(
        Object.entries(cfg || {}).filter(([, v]) => v !== undefined)
      )
    }
    const mergedOpts = { dmk: this._dmk }
    return new LedgerSignerBtc(`${relPath}`, mergedCfg, mergedOpts)
  }

  /** @returns {Promise<string>} */
  async getAddress () {
    await this._ensureDeviceReady('get address')
    if (!this._signerBtc) await this._connect()
    return this._address
  }

  async signPsbt (psbt) {
    await this._ensureDeviceReady('transaction signing')
    if (!this._signerBtc) await this._connect()

    // Parse derivation path: m/84'/0'/0'/0/0
    const pathParts = this._path.split('/')
    const accountLevelPath = pathParts.slice(1, 4).join('/') // "84'/0'/0'"
    const changeIndex = Number(pathParts[4]) || 0
    const addressIndex = Number(pathParts[5]) || 0
    const fullPath = pathParts.slice(1).join('/') // "84'/0'/0'/0/0"

    // Get network
    const network = this._config.network === 'bitcoin'
      ? networks.bitcoin
      : (networks[this._config.network] || networks.testnet)

    // 1. Get master fingerprint via raw APDU
    const apduResponse = await this._dmk.sendApdu({
      sessionId: this._sessionId,
      apdu: GET_MASTER_FINGERPRINT_APDU
    })

    // Response is 4 bytes fingerprint + 2 bytes status (0x9000 = success)
    const responseData = apduResponse.data || apduResponse
    const masterFingerprint = Buffer.from(responseData.slice(0, 4))

    // 2. Get account xpub to derive the pubkey for this address
    const { observable: xpubObs } = this._signerBtc.getExtendedPublicKey(
      accountLevelPath,
      { skipOpenApp: this.skipOpenApp }
    )
    const xpubResult = await this._consumeDeviceAction(xpubObs)
    const xpub = typeof xpubResult === 'string' ? xpubResult : xpubResult?.extendedPublicKey

    // Parse xpub and derive child pubkey
    const accountNode = bip32.fromBase58(xpub, network)
    const childNode = accountNode.derive(changeIndex).derive(addressIndex)
    const pubkey = childNode.publicKey

    // Build expected output script to identify our inputs
    const myScript = this._bip === 84
      ? payments.p2wpkh({ pubkey, network }).output
      : payments.p2pkh({ pubkey, network }).output

    // 3. Process each input - add witnessUtxo and bip32Derivation
    for (let i = 0; i < psbt.inputCount; i++) {
      const input = psbt.data.inputs[i] || {}
      const txIn = psbt.txInputs[i]

      // Extract prevOut from witnessUtxo or nonWitnessUtxo
      let prevOut = null
      if (input.witnessUtxo) {
        prevOut = input.witnessUtxo
      } else if (input.nonWitnessUtxo) {
        const prevTx = Transaction.fromBuffer(input.nonWitnessUtxo)
        prevOut = prevTx.outs[txIn.index]

        // Add witnessUtxo for SegWit (BIP84)
        if (this._bip === 84 && prevOut) {
          psbt.updateInput(i, {
            witnessUtxo: { script: prevOut.script, value: prevOut.value }
          })
        }
      }

      // Check if this input belongs to us and add bip32Derivation
      if (prevOut && prevOut.script && myScript.equals(prevOut.script)) {
        const hasOurDerivation = (input.bip32Derivation || []).some(
          d => d.pubkey && Buffer.isBuffer(d.pubkey) && d.pubkey.equals(pubkey)
        )

        if (!hasOurDerivation) {
          psbt.updateInput(i, {
            bip32Derivation: [
              ...(input.bip32Derivation || []),
              {
                masterFingerprint,
                path: `m/${fullPath}`,
                pubkey
              }
            ]
          })
        }
      }
    }

    // 4. Sign the PSBT
    const wallet = new DefaultWallet(
      accountLevelPath,
      this._bip === 44
        ? DefaultDescriptorTemplate.LEGACY
        : DefaultDescriptorTemplate.NATIVE_SEGWIT
    )

    const { observable } = this._signerBtc.signPsbt(
      wallet,
      psbt.toBase64(),
      { skipOpenApp: this.skipOpenApp }
    )

    const output = await this._consumeDeviceAction(observable)
    const signatures = Array.isArray(output) ? output : (output ? [output] : [])

    // 5. Apply signatures to the PSBT
    for (const psig of signatures) {
      if (psig && 'pubkey' in psig && 'signature' in psig && typeof psig.inputIndex === 'number') {
        const { pubkey: sigPubkey, signature, inputIndex } = psig
        const existing = psbt.data.inputs[inputIndex]?.partialSig || []
        psbt.updateInput(inputIndex, {
          partialSig: [...existing, {
            pubkey: Buffer.from(sigPubkey),
            signature: Buffer.from(signature)
          }]
        })
      }
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

    // Ledger expects derivation path without the "m/" prefix (e.g. "84'/1'/0'/0/1")
    const relPath = this._path.split('/').slice(1).join('/')
    const { observable } = this._signerBtc.signMessage(relPath, message, { skipOpenApp: this.skipOpenApp })
    const { r, s, v } = await this._consumeDeviceAction(observable)
    const rHex = String(r).replace(/^0x/i, '').padStart(64, '0')
    const sHex = String(s).replace(/^0x/i, '').padStart(64, '0')
    const baseSig = Buffer.concat([Buffer.from(rHex, 'hex'), Buffer.from(sHex, 'hex')])
    return Buffer.concat([Buffer.from([Number(v)]), baseSig]).toString('base64')
  }

  dispose () {
    this._disconnect()
    this._dmk = undefined
  }
}
