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

import { payments } from 'bitcoinjs-lib'
import bitcoinMessageModule from '@bitcoinerlab/btcmessage'
import * as ecc from '@bitcoinerlab/secp256k1'
import { toBase64 } from 'uint8array-tools'
import { ValueError } from '@tetherto/wdk-wallet'

const { MessageFactory } = bitcoinMessageModule.default ?? bitcoinMessageModule
const bitcoinMessage = MessageFactory(ecc)

/** @typedef {import('bitcoinjs-lib').Network} Network */
/** @typedef {import('bitcoinjs-lib').Psbt} Psbt */
/** @typedef {import('./signer-btc.js').BtcSignerConfig} BtcSignerConfig */
/** @typedef {import('./signer-btc.js').BtcAddressType} BtcAddressType */
/** @typedef {import('ecpair').ECPairInterface | import('bip32').BIP32Interface} SignerLike */

/**
 * Signs every PSBT input the given leaf key controls, in place.
 *
 * Input matching, previous-output validation and sighash computation are delegated entirely to
 * {@link Psbt#signAllInputs}: any input whose script the key controls gets a partial signature,
 * regardless of its script type. The PSBT is not finalized, to support partially signed
 * workflows (e.g. multisig).
 *
 * @internal
 * @param {Psbt} psbtInstance - The PSBT instance to sign (mutated in place).
 * @param {SignerLike} account - A leaf signer exposing `publicKey` and a `sign` method (e.g. an ECPair or a BIP32 node).
 * @returns {string} The (partially) signed PSBT in base64 format.
 * @throws {Error} If the signer cannot sign any input of the PSBT.
 */
export function signPsbtWithKey (psbtInstance, account) {
  const pubkey = account && account.publicKey
  if (!pubkey) return psbtInstance.toBase64()

  psbtInstance.signAllInputs(account)

  return psbtInstance.toBase64()
}

/**
 * The address type signers use when the configuration does not specify one.
 *
 * @internal
 * @type {BtcAddressType}
 */
export const DEFAULT_ADDRESS_TYPE = 'segwit'

/**
 * Maps a wallet-level BIP purpose (44 or 84) to the equivalent signer address type.
 *
 * @internal
 * @param {44 | 84} [bip] - The BIP address type from the wallet configuration.
 * @returns {BtcAddressType | undefined} The signer address type, or undefined if no bip was given.
 * @throws {ValueError} If an unsupported BIP is specified.
 */
export function getSignerTypeForBip (bip) {
  if (bip === undefined) return undefined
  if (![44, 84].includes(bip)) {
    throw new ValueError('Invalid bip specification. Supported bips: 44, 84.')
  }
  return bip === 44 ? 'legacy' : 'segwit'
}

/**
 * Derives a Bitcoin address from a public key.
 *
 * @internal
 * @param {Uint8Array} publicKey - The public key.
 * @param {Network} network - The network configuration.
 * @param {BtcAddressType} type - The address type.
 * @returns {string} The Bitcoin address.
 */
export function getAddressFromPublicKey (publicKey, network, type) {
  const { address } = type === 'legacy'
    ? payments.p2pkh({ pubkey: publicKey, network })
    : payments.p2wpkh({ pubkey: publicKey, network })
  return address
}

/**
 * Signs a message.
 *
 * @internal
 * @param {string} message - The message to sign.
 * @param {Uint8Array} privateKey - The private key.
 * @param {BtcAddressType} type - The address type.
 * @returns {string} The message's signature.
 */
export function signMessage (message, privateKey, type) {
  return toBase64(bitcoinMessage.sign(message, privateKey, true, type === 'legacy' ? undefined : { segwitType: 'p2wpkh' }))
}
