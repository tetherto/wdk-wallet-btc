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

import { keyExpressionBIP32 } from '@bitcoinerlab/descriptors'
import { ValueError } from '@tetherto/wdk-wallet'

/** @typedef {import('./index.js').ScriptType} ScriptType */
/** @typedef {import('bip32').BIP32Interface} BIP32Interface */

/**
 * The key origin of a descriptor key, as defined by BIP-380.
 *
 * @typedef {Object} KeyOrigin
 * @property {string} fingerprint - The fingerprint of the master key (8 hex characters).
 * @property {string} [path] - The derivation path from the master key down to the key, with a leading slash (e.g. "/84'/0'/0'").
 */

/**
 * A key given as an extended public key.
 *
 * @typedef {Object} XpubKeyParams
 * @property {string} xpub - The extended public key (xpub on mainnet, tpub on testnet and regtest).
 * @property {string} [keyPath] - The derivation path below the extended public key (e.g. "/0/*", "/<0;1>/*"). The `*` and the multipath are resolved by the `index` and `change` given to `Output`. If omitted, the key is used as is.
 * @property {KeyOrigin} [origin] - The key origin.
 */

/**
 * A key given as a bare public key.
 *
 * @typedef {Object} PubkeyKeyParams
 * @property {string} pubkey - The hex-encoded public key.
 * @property {KeyOrigin} [origin] - The key origin.
 */

/**
 * A key derived from a BIP-32 master node.
 *
 * @typedef {Object} MasterNodeKeyParams
 * @property {BIP32Interface} masterNode - The master node. Its fingerprint is used as the key origin's fingerprint.
 * @property {{ path: string }} origin - The derivation path from the master node down to the key, with a leading slash (e.g. "/84'/0'/0'").
 * @property {string} [keyPath] - The derivation path below the derived key (e.g. "/0/*"). The `*` and any multipath are resolved by the `index` and `change` given to `Output`. If omitted, the key is used as is.
 * @property {number} [change] - The chain below the derived key (0 for receive, 1 for change), forwarded to the key expression.
 * @property {number | '*'} [index] - The address index below the chain, or '*' for a ranged descriptor, forwarded to the key expression.
 */

/** @typedef {XpubKeyParams | PubkeyKeyParams | MasterNodeKeyParams} KeyParams */

/** @typedef {{ type: ScriptType } & KeyParams} DescriptorParams */

const SCRIPT_EXPRESSIONS = {
  legacy: (keyExpression) => `pkh(${keyExpression})`,
  segwit: (keyExpression) => `wpkh(${keyExpression})`
}

/**
 * @param {XpubKeyParams | PubkeyKeyParams} params
 * @returns {string}
 * @throws {ValueError} If the key parameters are inconsistent.
 */
function getKeyExpression ({ xpub, pubkey, origin, keyPath }) {
  if (!xpub && !pubkey) {
    throw new ValueError("A key is required: provide either 'xpub' or 'pubkey'.")
  }

  if (xpub && pubkey) {
    throw new ValueError("Provide either 'xpub' or 'pubkey', not both.")
  }

  if (pubkey && keyPath) {
    throw new ValueError("A bare public key cannot be derived: 'keyPath' is only valid with 'xpub'.")
  }

  if (origin && !origin.fingerprint) {
    throw new ValueError("The key origin requires a 'fingerprint'.")
  }

  const keyOrigin = origin ? `[${origin.fingerprint}${origin.path ?? ''}]` : ''

  return pubkey ? `${keyOrigin}${pubkey}` : `${keyOrigin}${xpub}${keyPath ?? ''}`
}

/**
 * @param {MasterNodeKeyParams} params
 * @returns {string}
 */
function getMasterNodeKeyExpression ({ masterNode, origin, keyPath, change, index }) {
  const hasChainIndex = change !== undefined || index !== undefined

  return keyExpressionBIP32({ masterNode, originPath: origin.path, keyPath: hasChainIndex ? keyPath : keyPath ?? '', change, index })
}

/**
 * Builds the output descriptor of a single-key script.
 *
 * @param {DescriptorParams} params
 * @returns {string} The descriptor.
 * @throws {ValueError} If the script type is not supported or the key parameters are inconsistent.
 */
export function getDescriptor ({ type, ...key }) {
  if (!Object.hasOwn(SCRIPT_EXPRESSIONS, type)) {
    throw new ValueError(`The script type '${type}' is not supported.`)
  }

  const scriptExpression = SCRIPT_EXPRESSIONS[type]

  const keyExpression = key.masterNode
    ? getMasterNodeKeyExpression(key)
    : getKeyExpression(key)

  return scriptExpression(keyExpression)
}

/**
 * Builds the output descriptor of an address.
 *
 * @param {string} address - The address.
 * @returns {string} The descriptor.
 */
export function getAddressDescriptor (address) {
  return `addr(${address})`
}
