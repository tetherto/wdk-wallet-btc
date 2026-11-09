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

import { ValueError } from '@tetherto/wdk-wallet'

/**
 * The type of script an output locks to. Signers use it for address encoding and message signing only, not PSBT signing.
 *
 * @typedef {"legacy" | "segwit"} ScriptType
 *   - "legacy": [P2PKH (BIP-44)](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)
 *   - "segwit": [P2WPKH / native SegWit (BIP-84)](https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki)
 * @todo Add support for P2SH-wrapped SegWit (BIP-49) and BIP-86 (Taproot).
 */

/**
 * The location of a transaction output, given by its transaction id and its index within that transaction.
 *
 * @typedef {Object} OutPoint
 * @property {string} txid - The id of the transaction containing the output (64-char hex, RPC byte order).
 * @property {number} vout - The output index within the transaction.
 */

/**
 * An unspent output as the chain reports it, with its outpoint, value and confirmation height.
 *
 * @typedef {Object} ChainUtxo
 * @property {OutPoint} outpoint - The output's location.
 * @property {bigint} value - The output value in satoshis.
 * @property {number} height - The block height (0 if unconfirmed).
 */

/**
 * The script, address and script type of an unspent output.
 *
 * @typedef {Object} UtxoScript
 * @property {Uint8Array} script - The output's scriptPubKey.
 * @property {string} address - The address the output pays to.
 * @property {ScriptType} scriptType - The type of script the output locks to.
 */

/**
 * A chain UTXO together with its script, address and script type.
 *
 * @typedef {ChainUtxo & UtxoScript} Utxo
 */

/**
 * An output created by a spend plan, with its address and value.
 *
 * @typedef {Object} SpendOutput
 * @property {string} address - The output's address.
 * @property {bigint} value - The output value in satoshis.
 * @property {boolean} [isChange] - True if the output pays back to the wallet.
 */

/**
 * A proposed transaction: its selected inputs, the outputs it creates, and its fee, fee rate and virtual size.
 *
 * @typedef {Object} SpendPlan
 * @property {Utxo[]} inputs - The selected unspent outputs.
 * @property {SpendOutput[]} outputs - All the transaction's outputs, in transaction order.
 * @property {bigint} fee - The fee in satoshis.
 * @property {number} feeRate - The fee rate in sat/vB (may be fractional).
 * @property {number} vsize - The estimated virtual size of the transaction.
 */

/** @type {ScriptType} */
export const DEFAULT_SCRIPT_TYPE = 'segwit'

export const DEFAULT_NETWORK = 'bitcoin'

const SCRIPT_TYPES = { legacy: { purpose: 44 }, segwit: { purpose: 84 } }
const NETWORKS = { bitcoin: { coinType: 0 }, testnet: { coinType: 1 }, regtest: { coinType: 1 } }

const PURPOSES = Object.values(SCRIPT_TYPES).map(({ purpose }) => purpose)
const COIN_TYPES = Object.values(NETWORKS).map(({ coinType }) => coinType)

const HARDENED_OFFSET = 2 ** 31
const PATH_SEGMENT = /^(0|[1-9]\d*)('?)$/
const UNSUPPORTED_PURPOSES = [49, 86]

/**
 * Resolves the network name of a configuration.
 *
 * @param {string} [network] - The configured network (default: "bitcoin").
 * @returns {"bitcoin" | "testnet" | "regtest"} The network name.
 * @throws {ValueError} If the network is given but is not supported.
 */
export function resolveNetwork (network = DEFAULT_NETWORK) {
  if (!Object.hasOwn(NETWORKS, network)) {
    throw new ValueError(`The network '${network}' is not supported.`)
  }

  return network
}

/**
 * Resolves the script type of a configuration.
 *
 * @param {ScriptType} [type] - The configured script type (default: "segwit").
 * @returns {ScriptType} The script type.
 * @throws {ValueError} If the type is given but is not supported.
 */
export function resolveType (type = DEFAULT_SCRIPT_TYPE) {
  if (!Object.hasOwn(SCRIPT_TYPES, type)) {
    throw new ValueError(`The script type '${type}' is not supported.`)
  }

  return type
}

/**
 * A segment of a BIP-32 derivation path.
 *
 * @typedef {Object} PathSegment
 * @property {number} index - The child index, without the hardened offset.
 * @property {boolean} hardened - True if the segment is hardened.
 */

/**
 * Parses a BIP-32 derivation path, either absolute ("m/84'/0'/0'") or relative ("0'/0/1").
 *
 * @param {string} path - The derivation path.
 * @returns {{ absolute: boolean, segments: PathSegment[] }} The parsed path.
 * @throws {ValueError} If a segment is not a canonical decimal index below 2^31, with an optional hardened marker.
 */
export function parsePath (path) {
  if (typeof path !== 'string') {
    throw new ValueError('The derivation path must be a string.')
  }

  const parts = path.split('/')
  const absolute = parts[0] === 'm'

  const segments = (absolute ? parts.slice(1) : parts).map(part => {
    const match = PATH_SEGMENT.exec(part)

    // BIP-32 (https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki#extended-keys): normal indices are 0 to 2^31-1, and a hardened index i_H is i + 2^31
    // An index must be smaller than 2^31
    const isIndexValid = match !== null && Number(match[1]) < HARDENED_OFFSET
    if (!isIndexValid) {
      throw new ValueError(`The derivation path '${path}' is invalid: '${part}' is not a valid segment.`)
    }

    return { index: Number(match[1]), hardened: match[2] === "'" }
  })

  return { absolute, segments }
}

/**
 * Checks that an absolute derivation path agrees with the resolved network and script type.
 *
 * The purpose names a script type (44' legacy, 84' segwit) and the coin type names a network (0' bitcoin, 1' testnet and regtest).
 * Purposes 49' and 86' name script types that are not supported. Other purposes and unhardened segments are not checked.
 *
 * @param {string} path - The absolute derivation path.
 * @param {{ network: "bitcoin" | "testnet" | "regtest", type: ScriptType }} config - The resolved configuration.
 * @throws {ValueError} If the path is invalid or not absolute, or its purpose or coin type disagrees with the configuration.
 */
export function assertPathMatchesConfig (path, { network, type }) {
  const { absolute, segments } = parsePath(path)
  const [purpose, coinType] = segments

  if (!absolute) {
    throw new ValueError(`The path '${path}' must be absolute (start with 'm').`)
  }

  if (purpose?.hardened) {
    if (UNSUPPORTED_PURPOSES.includes(purpose.index)) {
      throw new ValueError(`The path purpose ${purpose.index}' is not supported.`)
    }

    if (PURPOSES.includes(purpose.index) && purpose.index !== SCRIPT_TYPES[type].purpose) {
      throw new ValueError(`The path purpose ${purpose.index}' does not match the type '${type}'.`)
    }
  }

  if (coinType?.hardened && COIN_TYPES.includes(coinType.index) && coinType.index !== NETWORKS[network].coinType) {
    throw new ValueError(`The path coin type ${coinType.index}' does not match the network '${network}'.`)
  }
}

/**
 * Returns the relative BIP derivation path prefix (purpose'/coin_type') for the given configuration.
 *
 * @internal
 * @param {{ network?: string, type?: ScriptType }} [config] - The configuration.
 * @returns {string} The derivation path prefix (e.g. "84'/0'").
 * @throws {ValueError} If the network or type is given but is not supported.
 */
export function getBtcDerivationPathPrefix (config = {}) {
  const { purpose } = SCRIPT_TYPES[resolveType(config.type)]
  const { coinType } = NETWORKS[resolveNetwork(config.network)]
  return `${purpose}'/${coinType}'`
}
