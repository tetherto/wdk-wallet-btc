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

// TEST: Module-level log at package entry point - MUST APPEAR IF LOCAL PACKAGE IS LOADED
// Using multiple console methods to ensure visibility
console.log('🚀🚀🚀 [wdk-wallet-btc] LOCAL PACKAGE ENTRY POINT LOADED - index.js executed 🚀🚀🚀')
console.warn('⚠️⚠️⚠️ [wdk-wallet-btc] LOCAL PACKAGE ENTRY POINT LOADED - index.js executed ⚠️⚠️⚠️')
console.error('❌❌❌ [wdk-wallet-btc] LOCAL PACKAGE ENTRY POINT LOADED - index.js executed ❌❌❌')

/** @typedef {import('bitcoinjs-lib').Transaction} BtcTransactionReceipt */

/** @typedef {import('@tetherto/wdk-wallet').FeeRates} FeeRates */
/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet').TransferResult} TransferResult */

/** @typedef {import('./src/wallet-account-read-only-btc.js').BtcTransaction} BtcTransaction */
/** @typedef {import('./src/wallet-account-read-only-btc.js').BtcWalletConfig} BtcWalletConfig */

// CRITICAL: This code executes when the package is dynamically imported
// The dynamic import in pear-wrk-wdk will trigger this execution
console.log('🚀🚀🚀 [wdk-wallet-btc] DYNAMIC IMPORT TRIGGERED - index.js is being loaded 🚀🚀🚀')

// Import the modules (this will execute their top-level code when they're imported)
import WalletManagerBtcDefault from './src/wallet-manager-btc.js'
import WalletAccountReadOnlyBtcExport from './src/wallet-account-read-only-btc.js'
import WalletAccountBtcExport from './src/wallet-account-btc.js'

// Log after imports to confirm they executed
console.log('🚀🚀🚀 [wdk-wallet-btc] IMPORTS COMPLETED - All modules loaded from LOCAL package 🚀🚀🚀')

// Re-export the imported modules
export { WalletManagerBtcDefault as default }
export { WalletAccountReadOnlyBtcExport as WalletAccountReadOnlyBtc }
export { WalletAccountBtcExport as WalletAccountBtc }

// Final confirmation log
console.log('🚀🚀🚀 [wdk-wallet-btc] EXPORTS COMPLETED - Package ready for use 🚀🚀🚀')
