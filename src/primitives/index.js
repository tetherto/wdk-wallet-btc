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
