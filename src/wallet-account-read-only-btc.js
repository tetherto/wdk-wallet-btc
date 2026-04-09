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

import { WalletAccountReadOnly } from '@tetherto/wdk-wallet'

import { coinselect } from '@bitcoinerlab/coinselect'
import { DescriptorsFactory } from '@bitcoinerlab/descriptors'
import * as ecc from '@bitcoinerlab/secp256k1'

import { address as btcAddress, crypto, networks, Transaction } from 'bitcoinjs-lib'

import ElectrumClient from './electrum-client.js'

/** @typedef {import('@bitcoinerlab/coinselect').OutputWithValue} OutputWithValue */
/** @typedef {import('bitcoinjs-lib').Network} Network */
/** @typedef {import('bitcoinjs-lib').Transaction} BtcTransactionReceipt */

/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet').TransferResult} TransferResult */

/**
 * @typedef {Object} BtcTransaction
 * @property {string} to - The transaction's recipient.
 * @property {number | bigint} value - The amount of bitcoins to send to the recipient (in satoshis).
 * @property {number} [confirmationTarget] - Optional confirmation target in blocks (default: 1).
 * @property {number | bigint} [feeRate] - Optional fee rate in satoshis per virtual byte. If provided, this value overrides the fee rate estimated from the blockchain (default: undefined).
 * */

/**
 * @typedef {Object} BtcWalletConfig
 * @property {string} [host] - The electrum server's hostname (default: "electrum.blockstream.info").
 * @property {number} [port] - The electrum server's port (default: 50001).
 * @property {"bitcoin" | "regtest" | "testnet"} [network] The name of the network to use (default: "bitcoin").
 * @property {"tcp" | "tls" | "ssl"} [protocol] - The transport protocol to use (default: "tcp").
 * @property {44 | 84 | 86} [bip] - The BIP address type used for key and address derivation.
 *   - 44: [BIP-44 (P2PKH / legacy)](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)
 *   - 84: [BIP-84 (P2WPKH / native SegWit)](https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki)
 *   - 86: [BIP-86 (P2TR / Taproot)](https://github.com/bitcoin/bips/blob/master/bip-0086.mediawiki)
 *   - Default: 84 (P2WPKH).
 * @property {"P2WPKH" | "P2TR"} [script_type] - The script type of the wallet created by WalletManagerBtc.
 *   - "P2WPKH": Pay-to-Witness-Public-Key-Hash (native SegWit)
 *   - "P2TR": Pay-to-Taproot
 *   - Default: "P2WPKH".
 * */

/**
 * @typedef {Object} BtcMaxSpendableResult
 * @property {bigint} amount - The maximum spendable amount in satoshis.
 * @property {bigint} fee - The estimated network fee in satoshis.
 * @property {bigint} changeValue - The estimated change value in satoshis.
 */

const { Output } = DescriptorsFactory(ecc)

const MIN_TX_FEE_SATS = 141
const MAX_UTXO_INPUTS = 200

const BIP_BY_ADDRESS_PREFIX = {
  1: 44,
  m: 44,
  n: 44,
  bc1q: 84,
  tb1q: 84,
  bcrt1q: 84,
  bc1p: 86,
  tb1p: 86,
  bcrt1p: 86
}

const DUST_LIMIT = {
  44: 546n,
  84: 294n,
  86: 330n
}

// Logging bridge: Attempt to surface worklet logs to main thread
// Note: In bare-rpc worklets, console.log runs in a separate context and may not
// automatically appear in the main React Native thread. To view these logs:
// 1. Use adb logcat with broader filters: adb logcat | grep -i 'wallet\|worklet'
// 2. Or use: adb logcat ReactNativeJS:V ReactNative:V chromium:V console:V *:S
// 3. Worklet logs may appear in the device's native log output
//
// This override attempts to forward logs but may not work in all worklet environments
try {
  const originalLog = console.log
  const originalError = console.error
  const originalWarn = console.warn

  // Enhanced logging that includes worklet context
  console.log = function (...args) {
    originalLog.apply(console, ['[WORKLET]', ...args])
    // Try to surface via error (which React Native catches)
    // This is a fallback - errors are more likely to be forwarded
    try {
      if (typeof global !== 'undefined' && global.__wdkLog) {
        global.__wdkLog('log', args)
      }
    } catch (e) {
      // Silently fail
    }
  }

  console.error = function (...args) {
    originalError.apply(console, ['[WORKLET ERROR]', ...args])
    // Errors are more likely to be forwarded by React Native
    try {
      if (typeof global !== 'undefined' && global.__wdkLog) {
        global.__wdkLog('error', args)
      }
    } catch (e) {
      // Silently fail
    }
  }

  console.warn = function (...args) {
    originalWarn.apply(console, ['[WORKLET WARN]', ...args])
    try {
      if (typeof global !== 'undefined' && global.__wdkLog) {
        global.__wdkLog('warn', args)
      }
    } catch (e) {
      // Silently fail
    }
  }
} catch (e) {
  // If override fails, continue with original console
  console.warn('[wallet-account-read-only-btc] Logging bridge setup failed:', e.message)
}

// TEST: Module-level log to verify local package is loaded
console.log('🚀🚀🚀 [wdk-wallet-btc] LOCAL PACKAGE LOADED - wallet-account-read-only-btc.js module executed 🚀🚀🚀')

export default class WalletAccountReadOnlyBtc extends WalletAccountReadOnly {
  /**
   * Creates a new bitcoin read-only wallet account.
   *
   * @param {string} address - The account's address.
   * @param {Omit<BtcWalletConfig, 'bip'>} [config] - The configuration object.
   */
  constructor (address, config = {}) {
    super(address)

    // TEST: Local wdk-wallet-btc override is working! 🎉
    console.log('🚀 [wdk-wallet-btc] LOCAL VERSION DETECTED - Using local wdk-wallet-btc from file:../wdk-wallet-btc')

    /**
     * The read-only wallet account configuration.
     *
     * @protected
     * @type {Omit<BtcWalletConfig, 'bip'>}
     */
    this._config = config

    /**
     * The network.
     *
     * @protected
     * @type {Network}
     */
    // Validate network configuration and ensure it matches the address format
    const configNetwork = this._config.network
    if (configNetwork && !networks[configNetwork]) {
      console.warn(`[wallet-account-read-only-btc] Invalid network "${configNetwork}", defaulting to bitcoin. Valid networks: ${Object.keys(networks).join(', ')}`)
    }
    this._network = networks[configNetwork] || networks.bitcoin
    
    // Validate that the network matches the address format
    const addressLower = address.toLowerCase()
    const isTestnetAddress = addressLower.startsWith('tb1') || addressLower.startsWith('m') || addressLower.startsWith('n')
    const isMainnetAddress = addressLower.startsWith('bc1') || addressLower.startsWith('1') || addressLower.startsWith('3')
    
    if (isTestnetAddress && this._network === networks.bitcoin) {
      console.warn(`[wallet-account-read-only-btc] Testnet address detected but network is set to bitcoin. Address: ${address}, Config network: ${configNetwork}`)
      // Auto-correct: use testnet network for testnet addresses
      this._network = networks.testnet
      console.log(`[wallet-account-read-only-btc] Auto-corrected network to testnet`)
    } else if (isMainnetAddress && this._network === networks.testnet) {
      console.warn(`[wallet-account-read-only-btc] Mainnet address detected but network is set to testnet. Address: ${address}, Config network: ${configNetwork}`)
      // Auto-correct: use bitcoin network for mainnet addresses
      this._network = networks.bitcoin
      console.log(`[wallet-account-read-only-btc] Auto-corrected network to bitcoin`)
    }
    
    const resolvedNetworkName = this._network === networks.testnet ? 'testnet' : this._network === networks.bitcoin ? 'bitcoin' : this._network === networks.regtest ? 'regtest' : 'unknown'
    console.log(`[wallet-account-read-only-btc] Network configuration: config.network="${configNetwork}", resolved network="${resolvedNetworkName}"`)

    /**
     * An electrum client to interact with the bitcoin node.
     *
     * @protected
     * @type {ElectrumClient}
     */
    const electrumHost = config.host || 'electrum.blockstream.info'
    const electrumPort = config.port || 50_001
    const electrumProtocol = config.protocol || 'tcp'
    
    // Calculate and log the script hash for the address immediately
    let scriptHashForLogging = 'not calculated yet'
    try {
      const script = btcAddress.toOutputScript(address, this._network)
      const hash = crypto.sha256(script)
      const buffer = Buffer.from(hash).reverse()
      scriptHashForLogging = buffer.toString('hex')
      console.log(`[wallet-account-read-only-btc] ===== ADDRESS AND SCRIPT HASH =====`)
      console.log(`[wallet-account-read-only-btc] Address: ${address}`)
      console.log(`[wallet-account-read-only-btc] Script Hash: ${scriptHashForLogging}`)
      console.log(`[wallet-account-read-only-btc] Network: ${resolvedNetworkName}`)
      console.log(`[wallet-account-read-only-btc] Script (hex): ${script.toString('hex')}`)
      console.log(`[wallet-account-read-only-btc] ====================================`)
    } catch (error) {
      console.error(`[wallet-account-read-only-btc] Failed to calculate script hash during initialization:`, error.message)
    }
    
    console.log(`[wallet-account-read-only-btc] Electrum server configuration:`, {
      host: electrumHost,
      port: electrumPort,
      protocol: electrumProtocol,
      network: resolvedNetworkName,
      address: address,
      scriptHash: scriptHashForLogging
    })
    
    this._electrumClient = new ElectrumClient(
      electrumPort,
      electrumHost,
      electrumProtocol,
      {
        retryPeriod: config.retryPeriod ?? 1_000,
        maxRetry: config.maxRetry ?? 2,
        pingPeriod: config.pingPeriod ?? 120_000,
        callback: null
      }
    )

    const prefix = Object.keys(BIP_BY_ADDRESS_PREFIX).find(p => address.startsWith(p))
    const bip = BIP_BY_ADDRESS_PREFIX[prefix] || 44

    /**
     * The dust limit in satoshis based on the BIP type.
     *
     * @private
     * @type {number}
     */
    this._dustLimit = DUST_LIMIT[bip]
  }

  /**
   * Returns the account's bitcoin balance.
   *
   * @returns {Promise<bigint>} The bitcoin balance (in satoshis).
   */
  async getBalance () {
    // TEST: Verify local package is being used
    console.log('🚀 [wdk-wallet-btc] LOCAL VERSION - getBalance called (local package active)')
    const address = await this.getAddress()
    console.log('[wallet-account-read-only-btc] getBalance - Address:', address)
    console.log('[wallet-account-read-only-btc] getBalance - Network:', this._network === networks.testnet ? 'testnet' : this._network === networks.bitcoin ? 'bitcoin' : 'unknown')
    
    const scriptHash = await this._getScriptHash()
    console.log('[wallet-account-read-only-btc] getBalance - Script hash:', scriptHash)
    console.log('[wallet-account-read-only-btc] getBalance - Calling blockchainScripthash_getBalance...')

    try {
      const balanceResult = await this._electrumClient.blockchainScripthash_getBalance(scriptHash)
      console.log('[wallet-account-read-only-btc] getBalance - Raw balance result:', JSON.stringify(balanceResult))
      console.log('[wallet-account-read-only-btc] getBalance - Confirmed balance:', balanceResult.confirmed, 'sats')
      console.log('[wallet-account-read-only-btc] getBalance - Unconfirmed balance:', balanceResult.unconfirmed || 0, 'sats')
      
      const confirmed = BigInt(balanceResult.confirmed || 0)
      console.log('[wallet-account-read-only-btc] getBalance - Returning confirmed balance:', confirmed.toString(), 'sats')
      return confirmed
    } catch (error) {
      console.error('[wallet-account-read-only-btc] getBalance - ERROR:', error.message)
      console.error('[wallet-account-read-only-btc] getBalance - Error stack:', error.stack)
      throw error
    }
  }

  /**
   * Returns the account balance for a specific token.
   *
   * @param {string} tokenAddress - The smart contract address of the token.
   * @returns {Promise<bigint>} The token balance (in base unit).
   */
  async getTokenBalance (tokenAddress) {
    throw new Error("The 'getTokenBalance' method is not supported on the bitcoin blockchain.")
  }

  /**
   * Quotes the costs of a send transaction operation.
   *
   * @param {BtcTransaction} tx - The transaction.
   * @returns {Promise<Omit<TransactionResult, 'hash'>>} The transaction's quotes.
   */
  async quoteSendTransaction ({ to, value, feeRate, confirmationTarget = 1 }) {
    // TEST: Verify local package is being used
    console.log('🚀 [wdk-wallet-btc] LOCAL VERSION - quoteSendTransaction called (local package active)')
    const address = await this.getAddress()

    if (!feeRate) {
      const feeEstimate = await this._electrumClient.blockchainEstimatefee(confirmationTarget)
      console.log('[wallet-account-read-only-btc] blockchainEstimatefee raw result:', feeEstimate, 'BTC/KB')
      feeRate = this._toBigInt(Math.max(feeEstimate * 100_000, 1))
      console.log('[wallet-account-read-only-btc] Estimated fee rate:', feeRate.toString(), 'sats/vB (converted from', feeEstimate, 'BTC/KB)')
    } else {
      console.log('[wallet-account-read-only-btc] Using provided fee rate:', feeRate.toString(), 'sats/vB')
    }

    const { fee } = await this._planSpend({
      fromAddress: address,
      toAddress: to,
      amount: value,
      feeRate
    })

    return { fee: BigInt(fee) }
  }

  /**
   * Quotes the costs of a send transaction operation with a memo (OP_RETURN output).
   * Requires the recipient address to be a Taproot (P2TR) address.
   *
   * @param {Object} options - Transaction options.
   * @param {string} options.to - The recipient's Taproot Bitcoin address (must start with bc1p, tb1p, or bcrt1p).
   * @param {number | bigint} options.value - The amount to send (in satoshis).
   * @param {string} options.memo - The memo string to embed in OP_RETURN (max 75 bytes UTF-8).
   * @param {number | bigint} [options.feeRate] - Optional fee rate (in sats/vB). If not provided, estimated from network.
   * @param {number} [options.confirmationTarget] - Optional confirmation target in blocks (default: 1).
   * @returns {Promise<Omit<TransactionResult, 'hash'>>} The transaction's quotes.
   */
  async quoteSendTransactionWithMemo ({ to, value, memo, feeRate, confirmationTarget = 1 }) {
    // Validate that recipient address is a Taproot address
    const toLower = to.toLowerCase()
    const isTaproot = toLower.startsWith('bc1p') || toLower.startsWith('tb1p') || toLower.startsWith('bcrt1p')
    if (!isTaproot) {
      throw new Error('Recipient address must be a Taproot (P2TR) address. Taproot addresses start with bc1p (mainnet), tb1p (testnet), or bcrt1p (regtest).')
    }

    const address = await this.getAddress()

    if (!feeRate) {
      const feeEstimate = await this._electrumClient.blockchainEstimatefee(confirmationTarget)
      feeRate = this._toBigInt(Math.max(feeEstimate * 100_000, 1))
    }

    const { fee } = await this._planSpendWithMemo({
      fromAddress: address,
      toAddress: to,
      amount: value,
      memo,
      feeRate
    })

    return { fee: BigInt(fee) }
  }

  /**
   * Quotes the costs of a transfer operation.
   *
   * @param {TransferOptions} options - The transfer's options.
   * @returns {Promise<Omit<TransferResult, 'hash'>>} The transfer's quotes.
   */
  async quoteTransfer (options) {
    throw new Error("The 'quoteTransfer' method is not supported on the bitcoin blockchain.")
  }

  /**
   * Returns a transaction's receipt.
   *
   * @param {string} hash - The transaction's hash.
   * @returns {Promise<BtcTransactionReceipt | null>} – The receipt, or null if the transaction has not been included in a block yet.
   */
  async getTransactionReceipt (hash) {
    if (!/^[0-9a-fA-F]{64}$/.test(hash)) {
      throw new Error("The 'getTransactionReceipt(hash)' method requires a valid transaction hash to fetch the receipt.")
    }

    const scriptHash = await this._getScriptHash()
    const history = await this._electrumClient.blockchainScripthash_getHistory(scriptHash)
    const item = Array.isArray(history) ? history.find(h => h?.tx_hash === hash) : null

    if (!item || !item.height || item.height <= 0) {
      return null
    }

    const hex = await this._electrumClient.blockchainTransaction_get(hash, false)

    const transaction = Transaction.fromHex(hex)

    return transaction
  }

  /**
   * Returns the maximum spendable amount (in satoshis) that can be sent in
   * a single transaction, after subtracting estimated transaction fees.
   *
   * The maximum spendable amount can differ from the wallet's total balance.
   * A transaction can only include up to MAX_UTXO_INPUTS (default: 200) unspents.
   * Wallets holding more than this limit cannot spend their full balance in a
   * single transaction.
   *
   * @returns {Promise<BtcMaxSpendableResult>} The maximum spendable result.
   */
  async getMaxSpendable () {
    const fromAddress = await this.getAddress()
    console.log('[wallet-account-read-only-btc] getMaxSpendable - Address:', fromAddress)
    console.log('[wallet-account-read-only-btc] getMaxSpendable - Network:', this._network === networks.testnet ? 'testnet' : this._network === networks.bitcoin ? 'bitcoin' : 'unknown')
    
    const feeRateRaw = await this._electrumClient.blockchainEstimatefee(1)
    const feeRate = Math.max(Number(feeRateRaw) * 100_000, 1)
    console.log('[wallet-account-read-only-btc] getMaxSpendable - Fee rate:', feeRate, 'sats/vB')

    const scriptHash = await this._getScriptHash()
    console.log('[wallet-account-read-only-btc] getMaxSpendable - Script hash:', scriptHash)
    console.log('[wallet-account-read-only-btc] getMaxSpendable - Calling blockchainScripthash_listunspent...')
    
    let unspent
    try {
      unspent = await this._electrumClient.blockchainScripthash_listunspent(scriptHash)
      console.log('[wallet-account-read-only-btc] getMaxSpendable - blockchainScripthash_listunspent result:', JSON.stringify(unspent, null, 2))
      console.log('[wallet-account-read-only-btc] getMaxSpendable - UTXO count:', Array.isArray(unspent) ? unspent.length : 'N/A')
    } catch (error) {
      console.error('[wallet-account-read-only-btc] getMaxSpendable - ERROR:', error.message)
      console.error('[wallet-account-read-only-btc] getMaxSpendable - Error stack:', error.stack)
      throw error
    }
    
    if (!unspent || unspent.length === 0) {
      console.warn('[wallet-account-read-only-btc] getMaxSpendable - No UTXOs found')
      return { amount: 0n, fee: 0n, changeValue: 0n }
    }

    const addr = String(fromAddress).toLowerCase()
    const isP2WPKH =
      addr.startsWith('bc1q') ||
      addr.startsWith('tb1q') ||
      addr.startsWith('bcrt1q')
    const inputVBytes = isP2WPKH ? 68 : 148

    const perInputFee = Math.ceil(inputVBytes * feeRate)
    let spendableUtxos = unspent.filter(u => (u.value - perInputFee) > 0)
    if (spendableUtxos.length === 0) {
      return { amount: 0n, fee: 0n, changeValue: 0n }
    }

    if (spendableUtxos.length > MAX_UTXO_INPUTS) {
      spendableUtxos = spendableUtxos
        .sort((a, b) => b.value - a.value)
        .slice(0, MAX_UTXO_INPUTS)
    }

    const totalInputValueSats = spendableUtxos.reduce((sum, u) => sum + u.value, 0)
    const inputCount = spendableUtxos.length
    const txOverheadVBytes = 11
    const outputVBytes = 34

    const twoOutputsVSize = txOverheadVBytes + (inputCount * inputVBytes) + (2 * outputVBytes)
    const twoOutputsFeeSats = Math.max(Math.ceil(twoOutputsVSize * feeRate), MIN_TX_FEE_SATS)
    const twoOutputsRecipientAmountSats = totalInputValueSats - twoOutputsFeeSats - Number(this._dustLimit)
    if (twoOutputsRecipientAmountSats > Number(this._dustLimit)) {
      return {
        amount: BigInt(twoOutputsRecipientAmountSats),
        fee: BigInt(twoOutputsFeeSats),
        changeValue: this._dustLimit
      }
    }

    const oneOutputVSize = txOverheadVBytes + (inputCount * inputVBytes) + outputVBytes
    const oneOutputFeeSats = Math.max(Math.ceil(oneOutputVSize * feeRate), MIN_TX_FEE_SATS)
    const oneOutputRecipientAmountSats = totalInputValueSats - oneOutputFeeSats
    if (oneOutputRecipientAmountSats <= this._dustLimit) {
      return { amount: 0n, fee: 0n, changeValue: 0n }
    }

    return {
      amount: BigInt(oneOutputRecipientAmountSats),
      fee: BigInt(oneOutputFeeSats),
      changeValue: 0n
    }
  }

  /**
   * Computes the sha-256 hash of the output script for this wallet's address, reverses the byte order,
   * and returns it as a hex string.
   * Supports both P2WPKH (Bech32) and P2TR (Bech32m) address formats.
   *
   * @protected
   * @param {string} [address] - If set, hash this address’s scriptPubKey (must match the account’s keys when spending).
   * @returns {Promise<string>} The reversed sha-256 script hash as a hex-encoded string.
   */
  async _getScriptHash (address) {
    const resolved = address != null ? address : await this.getAddress()
    const networkName = this._network === networks.testnet ? 'testnet' : this._network === networks.bitcoin ? 'bitcoin' : this._network === networks.regtest ? 'regtest' : 'unknown'
    console.log('[wallet-account-read-only-btc] _getScriptHash called with address:', resolved)
    console.log('[wallet-account-read-only-btc] _getScriptHash using network:', networkName)
    console.log('[wallet-account-read-only-btc] _getScriptHash network object:', {
      messagePrefix: this._network.messagePrefix,
      bech32: this._network.bech32,
      pubKeyHash: this._network.pubKeyHash,
      scriptHash: this._network.scriptHash
    })
    
    // toOutputScript automatically handles both Bech32 (P2WPKH) and Bech32m (P2TR) addresses
    let script
    try {
      script = btcAddress.toOutputScript(resolved, this._network)
    } catch (error) {
      console.error(`[wallet-account-read-only-btc] _getScriptHash ERROR: Failed to convert address to script. Address: ${resolved}, Network: ${this._network === networks.testnet ? 'testnet' : this._network === networks.bitcoin ? 'bitcoin' : 'unknown'}, Error: ${error.message}`)
      // If conversion fails, try to auto-detect and use the correct network
      const addressLower = resolved.toLowerCase()
      if (addressLower.startsWith('tb1') || addressLower.startsWith('m') || addressLower.startsWith('n')) {
        console.log('[wallet-account-read-only-btc] _getScriptHash: Retrying with testnet network')
        this._network = networks.testnet
        script = btcAddress.toOutputScript(resolved, this._network)
      } else if (addressLower.startsWith('bc1') || addressLower.startsWith('1') || addressLower.startsWith('3')) {
        console.log('[wallet-account-read-only-btc] _getScriptHash: Retrying with bitcoin network')
        this._network = networks.bitcoin
        script = btcAddress.toOutputScript(resolved, this._network)
      } else {
        throw error
      }
    }
    
    const hash = crypto.sha256(script)
    const scriptHashHex = hash.toString('hex')
    console.log('[wallet-account-read-only-btc] _getScriptHash script (hex):', script.toString('hex'))
    console.log('[wallet-account-read-only-btc] _getScriptHash SHA256 hash (hex):', scriptHashHex)

    const buffer = Buffer.from(hash).reverse()
    const scriptHash = buffer.toString('hex')
    console.log('[wallet-account-read-only-btc] _getScriptHash returning script hash (reversed):', scriptHash)

    return scriptHash
  }

  /** @private */
  _toBigInt (v) { return typeof v === 'bigint' ? v : BigInt(Math.round(Number(v))) }

  /**
   * Builds and returns a fee-aware funding plan for sending a transaction.
   *
   * Uses descriptors + coinselect to choose inputs, at a given feeRate (sats/vB). Returns the selected
   * UTXOs (in the shape expected by the PSBT builder), the computed fee, and the resulting change value.
   *
   * @protected
   * @param {Object} tx - The transaction.
   * @param {string} tx.fromAddress - The sender's address.
   * @param {string} tx.toAddress - The recipient's address.
   * @param {number | bigint} tx.amount - The amount to send (in satoshis).
   * @param {number | bigint} tx.feeRate - The fee rate (in sats/vB).
   * @returns {Promise<{ utxos: OutputWithValue[], fee: number, changeValue: number }>} - The funding plan.
   */
  async _planSpend ({ fromAddress, toAddress, amount, feeRate }) {
    amount = this._toBigInt(amount)
    feeRate = this._toBigInt(feeRate)
    if (feeRate < 1n) feeRate = 1n

    console.log('[wallet-account-read-only-btc] _planSpend called with:', {
      fromAddress,
      toAddress,
      amount: amount.toString(),
      feeRate: feeRate.toString(),
      dustLimit: this._dustLimit.toString()
    })

    if (amount <= this._dustLimit) {
      throw new Error(`The amount must be bigger than the dust limit (= ${this._dustLimit}).`)
    }

    const network = this._network

    const fromAddressScriptHex = btcAddress.toOutputScript(fromAddress, network).toString('hex')
    const fromAddressOutput = new Output({ descriptor: `addr(${fromAddress})`, network })
    const toAddressOutput = new Output({ descriptor: `addr(${toAddress})`, network })

    const scriptHash = await this._getScriptHash(fromAddress)
    console.log('[wallet-account-read-only-btc] _planSpend scriptHash:', scriptHash)
    console.log('[wallet-account-read-only-btc] _planSpend fromAddress:', fromAddress)
    console.log('[wallet-account-read-only-btc] _planSpend network:', network)
    console.log('[wallet-account-read-only-btc] _planSpend network name:', network === networks.testnet ? 'testnet' : network === networks.bitcoin ? 'bitcoin' : 'unknown')
    console.log('[wallet-account-read-only-btc] _planSpend - About to call blockchainScripthash_listunspent with scriptHash:', scriptHash)

    let unspent
    try {
      unspent = await this._electrumClient.blockchainScripthash_listunspent(scriptHash)
      console.log('[wallet-account-read-only-btc] _planSpend - blockchainScripthash_listunspent SUCCESS')
      console.log('[wallet-account-read-only-btc] _planSpend unspent result type:', typeof unspent, Array.isArray(unspent) ? 'array' : 'not array')
      console.log('[wallet-account-read-only-btc] _planSpend unspent result length:', Array.isArray(unspent) ? unspent.length : 'N/A')
      console.log('[wallet-account-read-only-btc] _planSpend unspent result:', JSON.stringify(unspent, null, 2))
      
      if (Array.isArray(unspent) && unspent.length > 0) {
        console.log('[wallet-account-read-only-btc] _planSpend - Found', unspent.length, 'UTXOs:')
        unspent.forEach((utxo, index) => {
          console.log(`[wallet-account-read-only-btc] _planSpend - UTXO ${index + 1}:`, {
            tx_hash: utxo.tx_hash,
            tx_pos: utxo.tx_pos,
            value: utxo.value,
            height: utxo.height
          })
        })
      } else {
        console.warn('[wallet-account-read-only-btc] _planSpend - No UTXOs found or empty result')
      }
    } catch (error) {
      console.error('[wallet-account-read-only-btc] _planSpend - ERROR calling blockchainScripthash_listunspent:', error.message)
      console.error('[wallet-account-read-only-btc] _planSpend - Error stack:', error.stack)
      console.error('[wallet-account-read-only-btc] _planSpend - Script hash used:', scriptHash)
      console.error('[wallet-account-read-only-btc] _planSpend - Address:', fromAddress)
      console.error('[wallet-account-read-only-btc] _planSpend - Network:', network === networks.testnet ? 'testnet' : network === networks.bitcoin ? 'bitcoin' : 'unknown')
      throw error
    }

    if (!unspent || unspent.length === 0) {
      console.warn('[wallet-account-read-only-btc] _planSpend - No UTXOs found, attempting diagnostic checks...')
      
      // Try to get balance to see if address has funds
      try {
        const balance = await this._electrumClient.blockchainScripthash_getBalance(scriptHash)
        console.error('[wallet-account-read-only-btc] _planSpend - No UTXOs but balance check result:', JSON.stringify(balance, null, 2))
        console.error('[wallet-account-read-only-btc] _planSpend - Balance confirmed:', balance.confirmed, 'sats')
        console.error('[wallet-account-read-only-btc] _planSpend - Balance unconfirmed:', balance.unconfirmed || 0, 'sats')
        
        if (balance.confirmed > 0 || (balance.unconfirmed && balance.unconfirmed > 0)) {
          console.error('[wallet-account-read-only-btc] _planSpend - WARNING: Balance exists but no UTXOs returned! This may indicate an electrum server issue.')
        }
      } catch (balanceError) {
        console.error('[wallet-account-read-only-btc] _planSpend - Balance check failed:', balanceError.message)
        console.error('[wallet-account-read-only-btc] _planSpend - Balance check error stack:', balanceError.stack)
      }
      
      // Try to get history to see if there are any transactions
      try {
        const history = await this._electrumClient.blockchainScripthash_getHistory(scriptHash)
        console.error('[wallet-account-read-only-btc] _planSpend - History check result:', JSON.stringify(history, null, 2))
        console.error('[wallet-account-read-only-btc] _planSpend - History length:', Array.isArray(history) ? history.length : 'N/A')
      } catch (historyError) {
        console.error('[wallet-account-read-only-btc] _planSpend - History check failed:', historyError.message)
      }
      
      // Log diagnostic information
      console.error('[wallet-account-read-only-btc] _planSpend - DIAGNOSTIC INFO:', {
        address: fromAddress,
        scriptHash: scriptHash,
        network: network === networks.testnet ? 'testnet' : network === networks.bitcoin ? 'bitcoin' : 'unknown',
        configNetwork: this._config.network,
        configHost: this._config.host || 'electrum.blockstream.info',
        configPort: this._config.port || 50001
      })
      
      throw new Error(`🚀🚀🚀 LOCAL PACKAGE ACTIVE - No unspent outputs available for address ${fromAddress} (scriptHash: ${scriptHash}). 🚀🚀🚀`)
    }

    const totalBalance = unspent.reduce((sum, u) => sum + BigInt(u.value), 0n)
    console.log('[wallet-account-read-only-btc] UTXO information:', {
      utxoCount: unspent.length,
      totalBalance: totalBalance.toString(),
      totalBalanceBTC: (Number(totalBalance) / 100000000).toFixed(8),
      utxos: unspent.map(u => ({
        tx_hash: u.tx_hash,
        tx_pos: u.tx_pos,
        value: u.value,
        valueBTC: (u.value / 100000000).toFixed(8),
        height: u.height
      }))
    })

    const utxosForCoinSelect = unspent.map(u => ({
      output: fromAddressOutput,
      value: u.value,
      __ref: u
    }))

    // Calculate estimated transaction size for better fee estimation
    // Base transaction: ~10 vbytes overhead
    // Each input: ~68 vbytes (P2WPKH)
    // Each output: ~31 vbytes (P2WPKH) or ~43 vbytes (P2TR)
    const estimatedInputCount = Math.ceil(Number(amount) / (Number(totalBalance) / unspent.length)) || 1
    const estimatedOutputCount = 2 // recipient + change
    const estimatedVSize = 10 + (estimatedInputCount * 68) + (estimatedOutputCount * 31)
    const estimatedFeeFromSize = Number(feeRate) * estimatedVSize
    const estimatedTotalRequired = Number(amount) + estimatedFeeFromSize

    const coinselectParams = {
      utxoCount: utxosForCoinSelect.length,
      targetAmount: Number(amount),
      targetAmountBTC: (Number(amount) / 100000000).toFixed(8),
      feeRate: Number(feeRate),
      estimatedVSize,
      estimatedFeeFromSize,
      estimatedFeeFromSizeBTC: (estimatedFeeFromSize / 100000000).toFixed(8),
      estimatedTotalRequired,
      estimatedTotalRequiredBTC: (estimatedTotalRequired / 100000000).toFixed(8),
      totalBalanceAvailable: totalBalance.toString(),
      totalBalanceAvailableBTC: (Number(totalBalance) / 100000000).toFixed(8),
      sufficient: Number(totalBalance) >= estimatedTotalRequired
    }
    console.log('🚀🚀🚀 [LOCAL PACKAGE] Calling coinselect with:', JSON.stringify(coinselectParams, null, 2))
    console.warn('🚀🚀🚀 [LOCAL PACKAGE] Calling coinselect with:', JSON.stringify(coinselectParams, null, 2))
    console.error('🚀🚀🚀 [LOCAL PACKAGE] Calling coinselect with:', JSON.stringify(coinselectParams, null, 2))

    const result = coinselect({
      utxos: utxosForCoinSelect,
      remainder: fromAddressOutput,
      targets: [{ output: toAddressOutput, value: Number(amount) }],
      feeRate: Number(feeRate)
    })

    if (!result) {
      const failureDetails = {
        totalBalance: totalBalance.toString(),
        totalBalanceBTC: (Number(totalBalance) / 100000000).toFixed(8),
        requestedAmount: amount.toString(),
        requestedAmountBTC: (Number(amount) / 100000000).toFixed(8),
        feeRate: feeRate.toString(),
        estimatedVSize,
        estimatedFeeFromSize,
        estimatedFeeFromSizeBTC: (estimatedFeeFromSize / 100000000).toFixed(8),
        estimatedTotalRequired,
        estimatedTotalRequiredBTC: (estimatedTotalRequired / 100000000).toFixed(8),
        estimatedMinFee: (Number(feeRate) * 141).toString(), // MIN_TX_FEE_SATS = 141
        shortfall: estimatedTotalRequired - Number(totalBalance),
        shortfallBTC: ((estimatedTotalRequired - Number(totalBalance)) / 100000000).toFixed(8)
      }
      console.error('🚀🚀🚀 [LOCAL PACKAGE] coinselect FAILED - insufficient balance:', JSON.stringify(failureDetails, null, 2))
      console.warn('🚀🚀🚀 [LOCAL PACKAGE] coinselect FAILED - insufficient balance:', JSON.stringify(failureDetails, null, 2))
      console.log('🚀🚀🚀 [LOCAL PACKAGE] coinselect FAILED - insufficient balance:', JSON.stringify(failureDetails, null, 2))
      throw new Error(`🚀🚀🚀 LOCAL PACKAGE ACTIVE - Insufficient balance to send the transaction. Details: ${JSON.stringify(failureDetails)} 🚀🚀🚀`)
    }

    if (result.utxos.length > MAX_UTXO_INPUTS) {
      throw new Error('Exceeded maximum allowed inputs for transaction.')
    }

    const fee = this._toBigInt(Math.max(result.fee ?? 0, MIN_TX_FEE_SATS))

    const utxos = result.utxos.map(({ __ref }) => ({
      ...__ref,
      vout: {
        value: this._toBigInt(__ref.value),
        scriptPubKey: { hex: fromAddressScriptHex }
      }
    }))

    const total = utxos.reduce((s, u) => s + this._toBigInt(u.value), 0n)
    const changeValue = total - fee - amount

    // Calculate actual transaction size for fee analysis
    // P2WPKH: ~68 vbytes per input, ~31 vbytes per output, ~11 vbytes overhead
    // P2TR: ~58 vbytes per input, ~43 vbytes per output, ~11 vbytes overhead
    const inputCount = result.utxos.length
    const outputCount = changeValue > 0n ? 2 : 1 // recipient + change (if any)
    const isP2WPKH = fromAddress.toLowerCase().startsWith('bc1q') || fromAddress.toLowerCase().startsWith('tb1q')
    const inputVBytes = isP2WPKH ? 68 : 58
    const outputVBytes = isP2WPKH ? 31 : 43
    const txOverheadVBytes = 11
    const actualVSize = txOverheadVBytes + (inputCount * inputVBytes) + (outputCount * outputVBytes)
    const actualFeeFromSize = Number(feeRate) * actualVSize

    console.log('[wallet-account-read-only-btc] coinselect result:', {
      selectedUtxoCount: result.utxos.length,
      coinselectFee: result.fee,
      coinselectFeeBTC: result.fee ? (result.fee / 100000000).toFixed(8) : 'N/A',
      finalFee: fee.toString(),
      finalFeeBTC: (Number(fee) / 100000000).toFixed(8),
      feeRate: feeRate.toString(),
      feeRatePerVByte: Number(feeRate),
      actualVSize,
      actualFeeFromSize,
      actualFeeFromSizeBTC: (actualFeeFromSize / 100000000).toFixed(8),
      inputVBytesPerInput: inputVBytes,
      outputVBytesPerOutput: outputVBytes,
      outputCount,
      changeValue: changeValue.toString(),
      note: 'Fee = max(coinselect_fee, MIN_TX_FEE_SATS) where MIN_TX_FEE_SATS = 141'
    })

    console.log('[wallet-account-read-only-btc] Transaction plan:', {
      totalInput: total.toString(),
      totalInputBTC: (Number(total) / 100000000).toFixed(8),
      amount: amount.toString(),
      amountBTC: (Number(amount) / 100000000).toFixed(8),
      fee: fee.toString(),
      feeBTC: (Number(fee) / 100000000).toFixed(8),
      changeValue: changeValue.toString(),
      changeValueBTC: (Number(changeValue) / 100000000).toFixed(8),
      dustLimit: this._dustLimit.toString()
    })

    if (changeValue < 0n) {
      console.error('[wallet-account-read-only-btc] Insufficient balance after fees:', {
        totalInput: total.toString(),
        amount: amount.toString(),
        fee: fee.toString(),
        shortfall: (-changeValue).toString()
      })
      throw new Error('🚀🚀🚀 LOCAL PACKAGE ACTIVE - Insufficient balance after fees. 🚀🚀🚀')
    }

    if (changeValue <= this._dustLimit) {
      return {
        utxos,
        fee: fee + changeValue,
        changeValue: 0n
      }
    }

    return { utxos, fee, changeValue }
  }

  /**
   * Builds and returns a fee-aware funding plan for sending a transaction with a memo (OP_RETURN output).
   * Similar to _planSpend but accounts for the additional OP_RETURN output in fee calculation.
   *
   * @protected
   * @param {Object} tx - The transaction.
   * @param {string} tx.fromAddress - The sender's address.
   * @param {string} tx.toAddress - The recipient's Taproot address.
   * @param {number | bigint} tx.amount - The amount to send (in satoshis).
   * @param {string} tx.memo - The memo string to embed in OP_RETURN.
   * @param {number | bigint} tx.feeRate - The fee rate (in sats/vB).
   * @returns {Promise<{ utxos: OutputWithValue[], fee: number, changeValue: number }>} - The funding plan.
   */
  async _planSpendWithMemo ({ fromAddress, toAddress, amount, memo, feeRate }) {
    console.log('=== _planSpendWithMemo CALLED ===')
    console.log('[wallet-account-read-only-btc] _planSpendWithMemo fromAddress:', fromAddress)
    console.log('[wallet-account-read-only-btc] _planSpendWithMemo toAddress:', toAddress)
    console.log('[wallet-account-read-only-btc] _planSpendWithMemo amount:', amount.toString())
    amount = this._toBigInt(amount)
    feeRate = this._toBigInt(feeRate)
    if (feeRate < 1n) feeRate = 1n

    if (amount <= this._dustLimit) {
      throw new Error(`The amount must be bigger than the dust limit (= ${this._dustLimit}).`)
    }

    // Validate memo size (OP_RETURN can hold max 75 bytes)
    const memoBuffer = Buffer.from(memo, 'utf8')
    if (memoBuffer.length > 75) {
      throw new Error('Memo cannot exceed 75 bytes when UTF-8 encoded.')
    }

    const network = this._network

    const fromAddressScriptHex = btcAddress.toOutputScript(fromAddress, network).toString('hex')
    const fromAddressOutput = new Output({ descriptor: `addr(${fromAddress})`, network })
    const toAddressOutput = new Output({ descriptor: `addr(${toAddress})`, network })

    const scriptHash = await this._getScriptHash(fromAddress)
    console.log('[wallet-account-read-only-btc] _planSpendWithMemo scriptHash:', scriptHash)
    console.log('[wallet-account-read-only-btc] _planSpendWithMemo fromAddress:', fromAddress)
    console.log('[wallet-account-read-only-btc] _planSpendWithMemo network:', network)
    console.log('[wallet-account-read-only-btc] _planSpendWithMemo network name:', network === networks.testnet ? 'testnet' : network === networks.bitcoin ? 'bitcoin' : 'unknown')
    console.log('=== _planSpendWithMemo scriptHash obtained ===')
    console.log('[wallet-account-read-only-btc] _planSpendWithMemo - About to call blockchainScripthash_listunspent with scriptHash:', scriptHash)

    let unspent
    try {
      unspent = await this._electrumClient.blockchainScripthash_listunspent(scriptHash)
      console.log('[wallet-account-read-only-btc] _planSpendWithMemo - blockchainScripthash_listunspent SUCCESS')
      console.log('[wallet-account-read-only-btc] _planSpendWithMemo unspent result type:', typeof unspent, Array.isArray(unspent) ? 'array' : 'not array')
      console.log('[wallet-account-read-only-btc] _planSpendWithMemo unspent result length:', Array.isArray(unspent) ? unspent.length : 'N/A')
      console.log('[wallet-account-read-only-btc] _planSpendWithMemo unspent result:', JSON.stringify(unspent, null, 2))
      
      if (Array.isArray(unspent) && unspent.length > 0) {
        console.log('[wallet-account-read-only-btc] _planSpendWithMemo - Found', unspent.length, 'UTXOs:')
        unspent.forEach((utxo, index) => {
          console.log(`[wallet-account-read-only-btc] _planSpendWithMemo - UTXO ${index + 1}:`, {
            tx_hash: utxo.tx_hash,
            tx_pos: utxo.tx_pos,
            value: utxo.value,
            height: utxo.height
          })
        })
      } else {
        console.warn('[wallet-account-read-only-btc] _planSpendWithMemo - No UTXOs found or empty result')
      }
    } catch (error) {
      console.error('[wallet-account-read-only-btc] _planSpendWithMemo - ERROR calling blockchainScripthash_listunspent:', error.message)
      console.error('[wallet-account-read-only-btc] _planSpendWithMemo - Error stack:', error.stack)
      console.error('[wallet-account-read-only-btc] _planSpendWithMemo - Script hash used:', scriptHash)
      console.error('[wallet-account-read-only-btc] _planSpendWithMemo - Address:', fromAddress)
      console.error('[wallet-account-read-only-btc] _planSpendWithMemo - Network:', network === networks.testnet ? 'testnet' : network === networks.bitcoin ? 'bitcoin' : 'unknown')
      throw error
    }

    if (!unspent || unspent.length === 0) {
      console.warn('[wallet-account-read-only-btc] _planSpendWithMemo - No UTXOs found, attempting diagnostic checks...')
      
      // Try to get balance to see if address has funds
      try {
        const balance = await this._electrumClient.blockchainScripthash_getBalance(scriptHash)
        console.error('[wallet-account-read-only-btc] _planSpendWithMemo - No UTXOs but balance check result:', JSON.stringify(balance, null, 2))
        console.error('[wallet-account-read-only-btc] _planSpendWithMemo - Balance confirmed:', balance.confirmed, 'sats')
        console.error('[wallet-account-read-only-btc] _planSpendWithMemo - Balance unconfirmed:', balance.unconfirmed || 0, 'sats')
        
        if (balance.confirmed > 0 || (balance.unconfirmed && balance.unconfirmed > 0)) {
          console.error('[wallet-account-read-only-btc] _planSpendWithMemo - WARNING: Balance exists but no UTXOs returned! This may indicate an electrum server issue.')
        }
      } catch (balanceError) {
        console.error('[wallet-account-read-only-btc] _planSpendWithMemo - Balance check failed:', balanceError.message)
        console.error('[wallet-account-read-only-btc] _planSpendWithMemo - Balance check error stack:', balanceError.stack)
      }
      
      // Try to get history to see if there are any transactions
      try {
        const history = await this._electrumClient.blockchainScripthash_getHistory(scriptHash)
        console.error('[wallet-account-read-only-btc] _planSpendWithMemo - History check result:', JSON.stringify(history, null, 2))
        console.error('[wallet-account-read-only-btc] _planSpendWithMemo - History length:', Array.isArray(history) ? history.length : 'N/A')
      } catch (historyError) {
        console.error('[wallet-account-read-only-btc] _planSpendWithMemo - History check failed:', historyError.message)
      }
      
      // Log diagnostic information
      console.error('[wallet-account-read-only-btc] _planSpendWithMemo - DIAGNOSTIC INFO:', {
        address: fromAddress,
        scriptHash: scriptHash,
        network: network === networks.testnet ? 'testnet' : network === networks.bitcoin ? 'bitcoin' : 'unknown',
        configNetwork: this._config.network,
        configHost: this._config.host || 'electrum.blockstream.info',
        configPort: this._config.port || 50001
      })
      
      throw new Error(`🚀🚀🚀 LOCAL PACKAGE ACTIVE - No unspent outputs available for address ${fromAddress} (scriptHash: ${scriptHash}). 🚀🚀🚀`)
    }

    const utxosForCoinSelect = unspent.map(u => ({
      output: fromAddressOutput,
      value: u.value,
      __ref: u
    }))

    // Calculate OP_RETURN output size: OP_RETURN (1 byte) + push opcode (1 byte) + data length
    // OP_RETURN outputs are ~43 bytes (1 + 1 + up to 75 bytes, but typically smaller)
    // For fee estimation, we use the actual memo size + 2 bytes overhead
    const opReturnOutputSize = 1 + 1 + memoBuffer.length // OP_RETURN + push opcode + data

    // First, get base fee estimate without OP_RETURN
    const result = coinselect({
      utxos: utxosForCoinSelect,
      remainder: fromAddressOutput,
      targets: [{ output: toAddressOutput, value: Number(amount) }],
      feeRate: Number(feeRate)
    })

    if (!result) {
      throw new Error('🚀🚀🚀 LOCAL PACKAGE ACTIVE - Insufficient balance to send the transaction. 🚀🚀🚀')
    }

    if (result.utxos.length > MAX_UTXO_INPUTS) {
      throw new Error('Exceeded maximum allowed inputs for transaction.')
    }

    // Add additional fee for OP_RETURN output
    // OP_RETURN outputs add to the transaction size, so we need to account for this
    const baseFee = this._toBigInt(Math.max(result.fee ?? 0, MIN_TX_FEE_SATS))
    const opReturnFee = this._toBigInt(opReturnOutputSize) * feeRate
    const totalFee = baseFee + opReturnFee

    const utxos = result.utxos.map(({ __ref }) => ({
      ...__ref,
      vout: {
        value: this._toBigInt(__ref.value),
        scriptPubKey: { hex: fromAddressScriptHex }
      }
    }))

    const total = utxos.reduce((s, u) => s + this._toBigInt(u.value), 0n)
    const changeValue = total - totalFee - amount

    if (changeValue < 0n) {
      throw new Error('Insufficient balance after fees (including OP_RETURN output).')
    }

    if (changeValue <= this._dustLimit) {
      return {
        utxos,
        fee: totalFee + changeValue,
        changeValue: 0n
      }
    }

    return { utxos, fee: totalFee, changeValue }
  }
}
