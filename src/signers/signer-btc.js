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

import { ISigner, NotImplementedError } from '@tetherto/wdk-wallet'

/** @typedef {import('bitcoinjs-lib').Psbt} Psbt */
/** @typedef {import('@tetherto/wdk-wallet').UnsupportedOperationError} UnsupportedOperationError */

/**
 * The signer's address type. Governs address encoding and message signing only, not PSBT signing.
 *
 * @typedef {"legacy" | "segwit"} BtcAddressType
 *   - "legacy": [P2PKH (BIP-44)](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)
 *   - "segwit": [P2WPKH / native SegWit (BIP-84)](https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki)
 * TODO: Add support for P2SH-wrapped SegWit (BIP-49) and BIP-86 (Taproot).
 */

/**
 * @typedef {Object} BtcSignerConfig
 * @property {"bitcoin" | "regtest" | "testnet"} [network] - The name of the network to use (default: "bitcoin").
 * @property {BtcAddressType} [type] - The signer's address type (default: "segwit").
 */

/**
 * Interface for Bitcoin signers, extending the base `ISigner` from `@tetherto/wdk-wallet`.
 *
 * @interface
 */
export class ISignerBtc extends ISigner {
  /**
   * The account's address, if available.
   *
   * @deprecated Use {@link getAddress} instead. This property will be removed in an upcoming
   * release: not all signers (e.g. hardware signers) can expose the address synchronously.
   * @type {string | undefined}
   */
  get address () {
    throw new NotImplementedError('address')
  }

  /**
   * The name of the network the signer's addresses are encoded for.
   *
   * @type {"bitcoin" | "regtest" | "testnet"}
   */
  get network () {
    throw new NotImplementedError('network')
  }

  /**
   * The address type of the signer's addresses ("legacy" for P2PKH, "segwit" for P2WPKH).
   *
   * @type {BtcAddressType}
   */
  get type () {
    throw new NotImplementedError('type')
  }

  /**
   * Returns the extended public key (e.g. xpub/tpub).
   *
   * @returns {Promise<string>} The extended public key in base58 format.
   * @throws {UnsupportedOperationError} If the signer does not support extended keys.
   */
  async getExtendedPublicKey () {
    throw new NotImplementedError('getExtendedPublicKey()')
  }

  /**
   * Signs a PSBT (Partially Signed Bitcoin Transaction). Caller is responsible for finalizing it; we deliver it partially signed.
   *
   * @param {Psbt | string} psbt - The PSBT instance or base64 string.
   * @returns {Promise<string>} The (partially) signed PSBT in base64 format.
   * @throws {Error} If the signer cannot sign any input of the PSBT.
   */
  async signPsbt (psbt) {
    throw new NotImplementedError('signPsbt(psbt)')
  }
}
