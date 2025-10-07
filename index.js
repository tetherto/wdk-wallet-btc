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

/** @typedef {import('bitcoinjs-lib').Transaction} BtcTransactionReceipt */

/** @typedef {import('@tetherto/wdk-wallet').FeeRates} FeeRates */
/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet').TransferResult} TransferResult */

/** @typedef {import('./src/wallet-account-read-only-btc.js').BtcTransaction} BtcTransaction */
/** @typedef {import('./src/wallet-account-read-only-btc.js').BtcWalletConfig} BtcWalletConfig */

export { default } from './src/wallet-manager-btc.js'

export { default as WalletAccountReadOnlyBtc } from './src/wallet-account-read-only-btc.js'

export { default as WalletAccountBtc } from './src/wallet-account-btc.js'
