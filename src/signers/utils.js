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

import { crypto, payments, Transaction } from 'bitcoinjs-lib'

/** @typedef {import('bitcoinjs-lib').Network} Network */
/** @typedef {import('bitcoinjs-lib').Psbt} Psbt */

/**
 * Hashes a message using SHA256.
 *
 * @param {string} message - The message to hash.
 * @returns {Buffer} The SHA256 hash of the message.
 */
export function hashMessage (message) {
  return crypto.sha256(Buffer.from(message, 'utf8'))
}

/**
 * Builds a payment output script based on BIP standard.
 *
 * @param {number} bip - The BIP standard (44 for P2PKH, 84 for P2WPKH).
 * @param {Buffer} pubkey - The public key.
 * @param {Network} network - The network configuration.
 * @returns {Buffer} The output script.
 */
export function buildPaymentScript (bip, pubkey, network) {
  const payment = bip === 84
    ? payments.p2wpkh({ pubkey, network })
    : payments.p2pkh({ pubkey, network })
  return payment.output
}

/**
 * Detects whether a PSBT input belongs to the given script.
 *
 * @param {Psbt} psbtInstance - The PSBT instance.
 * @param {number} i - The input index.
 * @param {Buffer} myScript - The script to match against.
 * @returns {{ input: Object, prevOut: { script: Buffer, value: number } | null, isOurs: boolean }} The input data and ownership status.
 */
export function detectInputOwnership (psbtInstance, i, myScript) {
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
    isOurs = false
  }

  return { input, prevOut, isOurs }
}

/**
 * Adds witnessUtxo to a PSBT input if needed for BIP84 signing.
 *
 * @param {Psbt} psbtInstance - The PSBT instance.
 * @param {number} i - The input index.
 * @param {number} bip - The BIP standard.
 * @param {{ script: Buffer, value: number } | null} prevOut - The previous output.
 * @param {Object} input - The input data.
 */
export function ensureWitnessUtxoIfNeeded (psbtInstance, i, bip, prevOut, input) {
  try {
    if (bip === 84 && prevOut && prevOut.script && typeof prevOut.value === 'number' && !input.witnessUtxo) {
      psbtInstance.updateInput(i, {
        witnessUtxo: {
          script: prevOut.script,
          value: prevOut.value
        }
      })
    }
  } catch (err) {
    // ignore if cannot set
  }
}

/**
 * Normalizes wallet configuration with defaults.
 *
 * @param {Object} [config] - The configuration object.
 * @param {number} [config.bip=84] - The BIP standard (44 or 84).
 * @returns {Object} The normalized configuration.
 * @throws {Error} If an unsupported BIP is specified.
 */
export function normalizeConfig (config = {}) {
  const bip = config.bip ?? 84
  if (![44, 84].includes(bip)) {
    throw new Error('Invalid bip specification. Supported bips: 44, 84.')
  }
  return { ...config, bip }
}

/**
 * Derives a Bitcoin address from a public key.
 *
 * @param {Buffer} publicKey - The public key.
 * @param {Network} network - The network configuration.
 * @param {number} [bip=44] - The BIP standard (44 for P2PKH, 84 for P2WPKH).
 * @returns {string} The Bitcoin address.
 */
export function getAddressFromPublicKey (publicKey, network, bip = 44) {
  const { address } = bip === 44
    ? payments.p2pkh({ pubkey: publicKey, network })
    : payments.p2wpkh({ pubkey: publicKey, network })
  return address
}
