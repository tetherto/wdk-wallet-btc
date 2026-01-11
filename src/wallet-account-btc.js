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

import { hmac } from '@noble/hashes/hmac'
import { sha512 } from '@noble/hashes/sha512'
import { address as btcAddress, crypto, initEccLib, networks, payments, Psbt, Transaction } from 'bitcoinjs-lib'
import { tapTweakHash, tweakKey } from 'bitcoinjs-lib/src/payments/bip341.js'
import { BIP32Factory } from 'bip32'
import pLimit from 'p-limit'
import { LRUCache } from 'lru-cache'

import * as bip39 from 'bip39'
import * as ecc from '@bitcoinerlab/secp256k1'
import * as bitcoinMessage from 'bitcoinjs-message'

// eslint-disable-next-line camelcase
import { sodium_memzero } from 'sodium-universal'

import WalletAccountReadOnlyBtc from './wallet-account-read-only-btc.js'

// TEST: Module-level log to verify local package is loaded
console.log('🚀🚀🚀 [wdk-wallet-btc] LOCAL PACKAGE LOADED - wallet-account-btc.js module executed 🚀🚀🚀')

/** @typedef {import('@tetherto/wdk-wallet').IWalletAccount} IWalletAccount */

/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet').TransferResult} TransferResult */

/** @typedef {import('./wallet-account-read-only-btc.js').BtcTransaction} BtcTransaction */
/** @typedef {import('./wallet-account-read-only-btc.js').BtcWalletConfig} BtcWalletConfig */

/**
 * @typedef {Object} BtcTransfer
 * @property {string} txid - The transaction's id.
 * @property {string} address - The user's own address.
 * @property {number} vout - The index of the output in the transaction.
 * @property {number} height - The block height (if unconfirmed, 0).
 * @property {bigint} value - The value of the transfer (in satoshis).
 * @property {"incoming" | "outgoing"} direction - The direction of the transfer.
 * @property {bigint} [fee] - The fee paid for the full transaction (in satoshis).
 * @property {string} [recipient] - The receiving address for outgoing transfers.
 */

const MASTER_SECRET = Buffer.from('Bitcoin seed', 'utf8')

// BITCOIN constant used for BIP32 key derivation only
// Address encoding (Bech32 for P2WPKH, Bech32m for P2TR) is handled by bitcoinjs-lib network objects
// Network objects support Taproot: mainnet (bc1p), testnet (tb1p), regtest (bcrt1p)
const BITCOIN = {
  wif: 0x80,
  bip32: { public: 0x0488b21e, private: 0x0488ade4 },
  messagePrefix: '\x18Bitcoin Signed Message:\n',
  bech32: 'bc',
  pubKeyHash: 0x00,
  scriptHash: 0x05
}

const MAX_CONCURRENT_REQUESTS = 8
const MAX_CACHE_ENTRIES = 1000
const REQUEST_BATCH_SIZE = 64

const bip32 = BIP32Factory(ecc)

initEccLib(ecc)

function derivePath (seed, path) {
  const masterKeyAndChainCodeBuffer = hmac(sha512, MASTER_SECRET, seed)

  const privateKey = masterKeyAndChainCodeBuffer.slice(0, 32)
  const chainCode = masterKeyAndChainCodeBuffer.slice(32)

  const masterNode = bip32.fromPrivateKey(Buffer.from(privateKey), Buffer.from(chainCode), BITCOIN)
  const account = masterNode.derivePath(path)

  sodium_memzero(masterKeyAndChainCodeBuffer)
  sodium_memzero(privateKey)
  sodium_memzero(chainCode)

  return { masterNode, account }
}

/** @implements {IWalletAccount} */
export default class WalletAccountBtc extends WalletAccountReadOnlyBtc {
  /**
   * Creates a new bitcoin wallet account.
   * Supports P2PKH (BIP-44), P2WPKH (BIP-84), and P2TR Taproot (BIP-86) address types.
   * Taproot addresses use Schnorr signatures (BIP-340) for transaction signing.
   *
   * @param {string | Uint8Array} seed - The wallet's [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) seed phrase.
   * @param {string} path - The derivation path suffix (e.g. "0'/0/0").
   * @param {BtcWalletConfig} [config] - The configuration object.
   */
  constructor (seed, path, config = {}) {
    // TEST: Local wdk-wallet-btc override is working! 🎉
    console.log('🚀 [wdk-wallet-btc] LOCAL VERSION DETECTED - Using local wdk-wallet-btc from file:../wdk-wallet-btc')
    
    if (typeof seed === 'string') {
      if (!bip39.validateMnemonic(seed)) {
        throw new Error('The seed phrase is invalid.')
      }

      seed = bip39.mnemonicToSeedSync(seed)
    }

    // Determine bip value: use config.bip if provided, otherwise derive from script_type
    let bip = config.bip
    if (bip === undefined) {
      if (config.script_type === 'P2TR') {
        bip = 86
      } else {
        bip = 84 // Default to 84 (P2WPKH)
      }
    }

    // Determine script_type: use config.script_type if provided, otherwise derive from bip
    let scriptType = config.script_type
    if (scriptType === undefined) {
      if (bip === 86) {
        scriptType = 'P2TR'
      } else if (bip === 44) {
        scriptType = 'P2PKH' // Legacy, though not explicitly used in config
      } else {
        scriptType = 'P2WPKH' // Default for bip 84
      }
    }

    console.log('🚀🚀🚀 [wdk-wallet-btc] WalletAccountBtc constructor config:', {
      bip,
      scriptType,
      path,
      network: config.network,
      host: config.host,
      port: config.port
    })

    // Validate bip value
    if (![44, 84, 86].includes(bip)) {
      throw new Error('Invalid bip specification. Supported bips: 44, 84, 86.')
    }

    // Validate correlation between bip and script_type
    if (bip === 86 && scriptType !== 'P2TR') {
      throw new Error('BIP 86 requires script_type to be "P2TR".')
    }
    if (scriptType === 'P2TR' && bip !== 86) {
      throw new Error('script_type "P2TR" requires bip to be 86.')
    }

    const netdp = config.network === 'bitcoin' ? 0 : 1
    const fullPath = `m/${bip}'/${netdp}'/${path}`
    console.log('🚀🚀🚀 [wdk-wallet-btc] WalletAccountBtc derivation path:', fullPath)

    const { masterNode, account } = derivePath(seed, fullPath)

    const network = networks[config.network] || networks.bitcoin

    // Generate address based on script_type
    let address
    if (scriptType === 'P2TR') {
      // P2TR (Taproot) address generation
      // For BIP-86, the internal key is the BIP32 derived public key (without prefix)
      const { address: p2trAddress } = payments.p2tr({
        internalPubkey: account.publicKey.slice(1), // Remove 0x02/0x03 prefix
        network
      })
      address = p2trAddress
    } else if (bip === 44) {
      // P2PKH (Legacy) address generation
      const { address: p2pkhAddress } = payments.p2pkh({ pubkey: account.publicKey, network })
      address = p2pkhAddress
    } else {
      // P2WPKH (Native SegWit) address generation - default for bip 84
      const { address: p2wpkhAddress } = payments.p2wpkh({ pubkey: account.publicKey, network })
      address = p2wpkhAddress
    }

    console.log('🚀🚀🚀 [wdk-wallet-btc] WalletAccountBtc generated address:', address)
    super(address, config)

    /**
     * The wallet account configuration.
     *
     * @protected
     * @type {BtcWalletConfig}
     */
    this._config = config

    /** @private */
    this._path = fullPath

    /** @private */
    this._bip = bip

    /** @private */
    this._scriptType = scriptType

    /** @private */
    this._masterNode = masterNode

    /** @private */
    this._account = account

    // For BIP-86 single-key Taproot, store the internal public key (32-byte x-coordinate)
    // The publicKey from BIP32 is compressed (33 bytes), so we extract the 32-byte x-coordinate
    if (scriptType === 'P2TR') {
      if (!account || !account.publicKey) {
        throw new Error('Invalid account for P2TR initialization. Account or public key is missing.')
      }
      if (!Buffer.isBuffer(account.publicKey) && !(account.publicKey instanceof Uint8Array)) {
        throw new Error('Invalid account public key type for P2TR initialization. Expected Buffer or Uint8Array.')
      }
      if (account.publicKey.length !== 33) {
        throw new Error(`Invalid account public key length for P2TR initialization. Expected 33 bytes, got ${account.publicKey.length}.`)
      }
      /** @private */
      this._internalPubkey = Buffer.from(account.publicKey.slice(1))
      if (!this._internalPubkey || this._internalPubkey.length !== 32) {
        throw new Error('Failed to extract internal public key for P2TR. Expected 32-byte x-coordinate.')
      }
    } else {
      /** @private */
      this._internalPubkey = undefined
    }
  }

  /**
   * The derivation path's index of this account.
   *
   * @type {number}
   */
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

  /**
   * The account's key pair.
   *
   * @type {KeyPair}
   */
  get keyPair () {
    return {
      privateKey: this._account ? new Uint8Array(this._account.privateKey) : null,
      publicKey: new Uint8Array(this._account.publicKey)
    }
  }

  /**
   * The script type of this account (P2TR, P2WPKH, or P2PKH).
   *
   * @type {string}
   */
  get scriptType () {
    return this._scriptType
  }

  /**
   * Signs a message.
   * For P2WPKH (BIP-84) and P2TR (BIP-86), uses SegWit message signing format.
   * P2TR transactions use Schnorr signatures (BIP-340), but message signing format remains compatible.
   *
   * @param {string} message - The message to sign.
   * @returns {Promise<string>} The message's signature.
   */
  async sign (message) {
    return bitcoinMessage
      .sign(
        message,
        this._account.privateKey,
        true,
        this._bip === 84 ? { segwitType: 'p2wpkh' } : undefined
      )
      .toString('base64')
  }

  /**
   * Verifies a message's signature.
   *
   * @param {string} message - The original message.
   * @param {string} signature - The signature to verify.
   * @returns {Promise<boolean>} True if the signature is valid.
   */
  async verify (message, signature) {
    return bitcoinMessage
      .verify(
        message,
        await this.getAddress(),
        signature,
        null,
        true
      )
  }

  /**
   * Sends a transaction.
   *
   * @param {BtcTransaction} tx - The transaction.
   * @returns {Promise<TransactionResult>} The transaction's result.
   */
  async sendTransaction ({ to, value, feeRate, confirmationTarget = 1 }) {
    const address = await this.getAddress()

    if (!feeRate) {
      const feeEstimate = await this._electrumClient.blockchainEstimatefee(confirmationTarget)
      feeRate = this._toBigInt(Math.max(feeEstimate * 100_000, 1))
    }

    const { utxos, fee, changeValue } = await this._planSpend({
      fromAddress: address,
      toAddress: to,
      amount: value,
      feeRate
    })

    const tx = await this._getRawTransaction({ utxos, to, value, fee, feeRate, changeValue })

    await this._electrumClient.blockchainTransaction_broadcast(tx.hex)

    return { hash: tx.txid, fee: tx.fee }
  }

  /**
   * Sends a transaction with a memo (OP_RETURN output).
   * Requires the recipient address to be a Taproot (P2TR) address.
   *
   * @param {Object} options - Transaction options.
   * @param {string} options.to - The recipient's Taproot Bitcoin address (must start with bc1p, tb1p, or bcrt1p).
   * @param {number | bigint} options.value - The amount to send (in satoshis).
   * @param {string} options.memo - The memo string to embed in OP_RETURN (max 75 bytes UTF-8).
   * @param {number | bigint} [options.feeRate] - Optional fee rate (in sats/vB). If not provided, estimated from network.
   * @param {number} [options.confirmationTarget] - Optional confirmation target in blocks (default: 1).
   * @returns {Promise<TransactionResult>} The transaction result.
   */
  async sendTransactionWithMemo ({ to, value, memo, feeRate, confirmationTarget = 1 }) {
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

    const { utxos, fee, changeValue } = await this._planSpendWithMemo({
      fromAddress: address,
      toAddress: to,
      amount: value,
      memo,
      feeRate
    })

    // Create OP_RETURN script from memo
    const opReturnScript = this.createOpReturnScript(memo)

    // Build transaction with OP_RETURN output
    const tx = await this._getRawTransaction({
      utxos,
      to,
      value,
      fee,
      feeRate,
      changeValue,
      additionalOutputs: [{ script: opReturnScript, value: 0 }]
    })

    await this._electrumClient.blockchainTransaction_broadcast(tx.hex)

    return { hash: tx.txid, fee: tx.fee }
  }

  /**
   * Quotes a transaction and returns the raw hexadecimal string without broadcasting it.
   * Works with both P2WPKH (Native SegWit) and P2TR (Taproot) addresses.
   * Similar to sendTransaction but returns the transaction hex instead of broadcasting.
   *
   * @param {Object} options - Transaction options.
   * @param {string} options.to - The recipient's Bitcoin address (P2WPKH or P2TR).
   * @param {number | bigint} options.value - The amount to send (in satoshis).
   * @param {number | bigint} [options.feeRate] - Optional fee rate (in sats/vB). If not provided, estimated from network.
   * @param {number} [options.confirmationTarget] - Optional confirmation target in blocks (default: 1).
   * @returns {Promise<string>} The raw hexadecimal string of the transaction.
   */
  async quoteSendTransactionTX ({ to, value, feeRate, confirmationTarget = 1 }) {
    console.log('[wallet-account-btc] quoteSendTransactionTX called with:', {
      to,
      value: value.toString(),
      feeRate: feeRate ? feeRate.toString() : 'auto',
      confirmationTarget
    })
    
    const address = await this.getAddress()
    console.log('[wallet-account-btc] From address:', address)

    if (!feeRate) {
      const feeEstimate = await this._electrumClient.blockchainEstimatefee(confirmationTarget)
      console.log('[wallet-account-btc] blockchainEstimatefee raw result:', feeEstimate, 'BTC/KB')
      feeRate = this._toBigInt(Math.max(feeEstimate * 100_000, 1))
      console.log('[wallet-account-btc] Estimated fee rate:', feeRate.toString(), 'sats/vB (converted from', feeEstimate, 'BTC/KB)')
    } else {
      console.log('[wallet-account-btc] Using provided fee rate:', feeRate.toString(), 'sats/vB')
    }

    const { utxos, fee, changeValue } = await this._planSpend({
      fromAddress: address,
      toAddress: to,
      amount: value,
      feeRate
    })
    
    console.log('[wallet-account-btc] Plan spend result:', {
      utxoCount: utxos.length,
      fee: fee.toString(),
      changeValue: changeValue.toString(),
      totalInput: utxos.reduce((sum, u) => sum + this._toBigInt(u.value), 0n).toString()
    })

    // Build transaction WITHOUT memo (no additionalOutputs)
    const tx = await this._getRawTransaction({
      utxos,
      to,
      value,
      fee,
      feeRate,
      changeValue
    })
    
    console.log('[wallet-account-btc] Transaction created:', {
      txid: tx.txid,
      hexLength: tx.hex.length,
      vsize: tx.vsize,
      fee: tx.fee.toString()
    })
    console.log('[wallet-account-btc] Full transaction hex:', tx.hex)

    return tx.hex
  }

  /**
   * Quotes a transaction with memo (OP_RETURN output) and returns the raw hexadecimal string.
   * Requires the recipient address to be a Taproot (P2TR) address.
   * Similar to quoteSendTransactionWithMemo but returns the transaction hex instead of just the fee.
   *
   * @param {Object} options - Transaction options.
   * @param {string} options.to - The recipient's Taproot Bitcoin address (must start with bc1p, tb1p, or bcrt1p).
   * @param {number | bigint} options.value - The amount to send (in satoshis).
   * @param {string} options.memo - The memo string to embed in OP_RETURN (max 75 bytes UTF-8).
   * @param {number | bigint} [options.feeRate] - Optional fee rate (in sats/vB). If not provided, estimated from network.
   * @param {number} [options.confirmationTarget] - Optional confirmation target in blocks (default: 1).
   * @returns {Promise<string>} The raw hexadecimal string of the transaction.
   */
  async quoteSendTransactionWithMemoTX ({ to, value, memo, feeRate, confirmationTarget = 1 }) {
    // Validate that recipient address is a Taproot address
    const toLower = to.toLowerCase()
    const isTaproot = toLower.startsWith('bc1p') || toLower.startsWith('tb1p') || toLower.startsWith('bcrt1p')
    if (!isTaproot) {
      throw new Error('Recipient address must be a Taproot (P2TR) address. Taproot addresses start with bc1p (mainnet), tb1p (testnet), or bcrt1p (regtest).')
    }

    // TEST: Hardcoded address
    const address = 'bc1pcp2p7nzg8kknr42w6yel8k7hpy5tedjpacnwlvtfhzgmaq6u4qnq06nhac'
    // const address = await this.getAddress()

    if (!feeRate) {
      const feeEstimate = await this._electrumClient.blockchainEstimatefee(confirmationTarget)
      feeRate = this._toBigInt(Math.max(feeEstimate * 100_000, 1))
    }

    const { utxos, fee, changeValue } = await this._planSpendWithMemo({
      fromAddress: address,
      toAddress: to,
      amount: value,
      memo,
      feeRate
    })

    // Create OP_RETURN script from memo
    const opReturnScript = this.createOpReturnScript(memo)

    // Build transaction with OP_RETURN output (but don't broadcast)
    const tx = await this._getRawTransaction({
      utxos,
      to,
      value,
      fee,
      feeRate,
      changeValue,
      additionalOutputs: [{ script: opReturnScript, value: 0 }]
    })

    return tx.hex
  }

  /**
   * Creates an OP_RETURN script from hex-encoded data.
   * Similar to createOpReturnScript but accepts hex data instead of UTF-8 string.
   *
   * @param {string} hexData - The hex-encoded data to embed.
   * @returns {Buffer} The OP_RETURN script as a Buffer.
   */
  createOpReturnScriptFromHex (hexData) {
    // Validate hex string
    if (!/^[0-9a-fA-F]*$/.test(hexData)) {
      throw new Error('Hex data must be a valid hexadecimal string')
    }

    const dataBuffer = Buffer.from(hexData, 'hex')
    const dataLength = dataBuffer.length

    // OP_RETURN (0x6a) + OP_PUSHNUM_1 (0x51) + push opcode + data
    // For data <= 75 bytes, use OP_PUSHBYTES_<n> (0x01-0x4b)
    // For larger data, we'd need OP_PUSHDATA1/2/4, but 75 bytes is usually enough
    if (dataLength > 75) {
      throw new Error('OP_RETURN data cannot exceed 75 bytes')
    }

    const script = Buffer.allocUnsafe(1 + 1 + 1 + dataLength)
    script[0] = 0x6a // OP_RETURN
    script[1] = 0x51 // OP_PUSHNUM_1
    script[2] = dataLength // OP_PUSHBYTES_<n>
    dataBuffer.copy(script, 3)

    return script
  }

  /**
   * Quotes a transaction that updates a prior transaction with hex data in OP_RETURN.
   * Creates a transaction with 2 inputs:
   * 1. A UTXO from the priorTx that has a value of 1007 sats (signed by priorAcct)
   * 2. A UTXO from the main account to fund this transaction (signed by this account)
   *
   * Outputs (in order):
   * 1. Spend 1007 sats to the "to" address param
   * 2. An OP_RETURN output containing the hex-encoded data
   * 3. The change returning to the main account
   *
   * Returns the transaction hex without broadcasting.
   *
   * @param {Object} options - Transaction options.
   * @param {string} options.to - The recipient's Bitcoin address.
   * @param {string} options.hex - The hex-encoded data string to embed in OP_RETURN.
   * @param {string} options.priorTx - The existing transaction id to reference.
   * @param {WalletAccountBtc} options.priorAcct - The account that owns the priorTx UTXO (for signing).
   * @param {number | bigint} [options.value] - The amount to send (in satoshis, default: 1007).
   * @param {number | bigint} [options.feeRate] - Optional fee rate (in sats/vB). If not provided, estimated from network.
   * @param {number} [options.confirmationTarget] - Optional confirmation target in blocks (default: 1).
   * @returns {Promise<string>} The raw hexadecimal string of the transaction.
   */
  async quoteUpdateTransactionWithHexTX ({ to, hex, priorTx, priorAcct, value, feeRate, confirmationTarget = 1 }) {
    // Default value to 1007 if not provided
    const sendValue = value !== undefined ? this._toBigInt(value) : 1007n

    const address = await this.getAddress()
    const network = this._network

    if (!feeRate) {
      const feeEstimate = await this._electrumClient.blockchainEstimatefee(confirmationTarget)
      feeRate = this._toBigInt(Math.max(feeEstimate * 100_000, 1))
    }

    feeRate = this._toBigInt(feeRate)
    if (feeRate < 1n) feeRate = 1n

    // Fetch the prior transaction
    const priorTxHex = await this._electrumClient.blockchainTransaction_get(priorTx, false)
    const priorTransaction = Transaction.fromHex(priorTxHex)

    // Find an output from priorTx with value 1007 sats
    let priorUtxoIndex = -1
    let priorUtxoScript = null
    for (let i = 0; i < priorTransaction.outs.length; i++) {
      const output = priorTransaction.outs[i]
      if (BigInt(output.value) === 1007n) {
        priorUtxoIndex = i
        priorUtxoScript = output.script
        break
      }
    }

    if (priorUtxoIndex === -1) {
      throw new Error(`No output with value 1007 sats found in transaction ${priorTx}`)
    }

    // Get UTXOs from main account
    const scriptHash = await this._getScriptHash()
    const unspent = await this._electrumClient.blockchainScripthash_listunspent(scriptHash)

    if (!unspent || unspent.length === 0) {
      throw new Error(`No unspent outputs available for address ${address}`)
    }

    // Get the script for the account's address
    const fromAddressScriptHex = btcAddress.toOutputScript(address, network).toString('hex')

    // Validate priorAcct parameter
    if (!priorAcct) {
      throw new Error('priorAcct parameter is required to sign the prior transaction UTXO')
    }

    // Get priorAcct address and verify network matches
    const priorAcctAddress = await priorAcct.getAddress()
    const priorAcctNetwork = priorAcct._network
    if (priorAcctNetwork.name !== network.name) {
      throw new Error('priorAcct network must match the current account network')
    }

    // Verify that the priorTx UTXO script matches the priorAcct's address script
    // This ensures priorAcct can sign the input
    const priorAcctScriptHex = btcAddress.toOutputScript(priorAcctAddress, network).toString('hex')
    const priorUtxoScriptHex = priorUtxoScript.toString('hex')
    if (priorUtxoScriptHex !== priorAcctScriptHex) {
      throw new Error(`Prior transaction UTXO script does not match priorAcct address. Cannot sign this input.`)
    }

    // Create OP_RETURN script from hex
    const opReturnScript = this.createOpReturnScriptFromHex(hex)

    // Estimate transaction size for fee calculation
    // Base: ~10-11 vbytes
    // Inputs: 2 inputs (priorTx UTXO + main account UTXO)
    //   - P2WPKH: ~68 vbytes per input
    //   - P2TR: ~58 vbytes per input
    // Outputs: 3 outputs (to address + OP_RETURN + change)
    //   - P2WPKH: ~31 vbytes per output
    //   - P2TR: ~43 vbytes per output
    const isP2WPKH = address.toLowerCase().startsWith('bc1q') || address.toLowerCase().startsWith('tb1q')
    const inputVBytes = isP2WPKH ? 68 : 58
    const outputVBytes = isP2WPKH ? 31 : 43
    const txOverheadVBytes = 11
    const estimatedVSize = txOverheadVBytes + (2 * inputVBytes) + (3 * outputVBytes)
    const estimatedFee = BigInt(estimatedVSize) * feeRate

    // Calculate total needed: sendValue + estimatedFee
    const totalNeeded = sendValue + estimatedFee

    // Select UTXO from main account to fund the transaction
    // We need at least totalNeeded amount
    let selectedUtxo = null
    for (const utxo of unspent) {
      if (BigInt(utxo.value) >= totalNeeded) {
        selectedUtxo = utxo
        break
      }
    }

    // If no single UTXO is large enough, try to find one that's close
    if (!selectedUtxo) {
      // Sort by value descending and take the largest
      const sortedUtxos = [...unspent].sort((a, b) => Number(b.value) - Number(a.value))
      if (sortedUtxos.length > 0) {
        selectedUtxo = sortedUtxos[0]
      }
    }

    if (!selectedUtxo) {
      throw new Error(`Insufficient balance to fund transaction. Need at least ${totalNeeded.toString()} sats.`)
    }

    // Construct UTXO list with both inputs
    const utxos = [
      {
        tx_hash: priorTx,
        tx_pos: priorUtxoIndex,
        value: 1007,
        vout: {
          value: 1007n,
          scriptPubKey: { hex: priorUtxoScript.toString('hex') }
        }
      },
      {
        tx_hash: selectedUtxo.tx_hash,
        tx_pos: selectedUtxo.tx_pos,
        value: selectedUtxo.value,
        vout: {
          value: this._toBigInt(selectedUtxo.value),
          scriptPubKey: { hex: fromAddressScriptHex }
        }
      }
    ]

    // Calculate total input value
    const totalInput = utxos.reduce((sum, u) => sum + this._toBigInt(u.value), 0n)

    // Recalculate actual fee based on transaction size
    // We'll build the transaction and adjust if needed
    const changeValue = totalInput - sendValue - estimatedFee

    // Build transaction with multi-account signing
    // First input (priorTx UTXO) is signed by priorAcct
    // Second input (main account UTXO) is signed by this account
    const tx = await this._buildMultiAccountTransaction({
      utxos,
      to,
      value: sendValue,
      fee: estimatedFee,
      feeRate,
      changeValue: changeValue > 0n ? changeValue : 0n,
      additionalOutputs: [{ script: opReturnScript, value: 0 }],
      priorAcct
    })

    return tx.hex
  }

  /**
   * Sends a transaction that updates a prior transaction with hex data in OP_RETURN.
   * Creates a transaction with 2 inputs:
   * 1. A UTXO from the priorTx that has a value of 1007 sats (signed by priorAcct)
   * 2. A UTXO from the main account to fund this transaction (signed by this account)
   *
   * Outputs (in order):
   * 1. Spend 1007 sats to the "to" address param
   * 2. An OP_RETURN output containing the hex-encoded data
   * 3. The change returning to the main account
   *
   * Broadcasts the transaction and returns the transaction result.
   *
   * @param {Object} options - Transaction options.
   * @param {string} options.to - The recipient's Bitcoin address.
   * @param {string} options.hex - The hex-encoded data string to embed in OP_RETURN.
   * @param {string} options.priorTx - The existing transaction id to reference.
   * @param {WalletAccountBtc} options.priorAcct - The account that owns the priorTx UTXO (for signing).
   * @param {number | bigint} [options.value] - The amount to send (in satoshis, default: 1007).
   * @param {number | bigint} [options.feeRate] - Optional fee rate (in sats/vB). If not provided, estimated from network.
   * @param {number} [options.confirmationTarget] - Optional confirmation target in blocks (default: 1).
   * @returns {Promise<TransactionResult>} The transaction result with hash and fee.
   */
  async updateTransactionWithHex ({ to, hex, priorTx, priorAcct, value, feeRate, confirmationTarget = 1 }) {
    // Default value to 1007 if not provided
    const sendValue = value !== undefined ? this._toBigInt(value) : 1007n

    const address = await this.getAddress()
    const network = this._network

    if (!feeRate) {
      const feeEstimate = await this._electrumClient.blockchainEstimatefee(confirmationTarget)
      feeRate = this._toBigInt(Math.max(feeEstimate * 100_000, 1))
    }

    feeRate = this._toBigInt(feeRate)
    if (feeRate < 1n) feeRate = 1n

    // Fetch the prior transaction
    const priorTxHex = await this._electrumClient.blockchainTransaction_get(priorTx, false)
    const priorTransaction = Transaction.fromHex(priorTxHex)

    // Find an output from priorTx with value 1007 sats
    let priorUtxoIndex = -1
    let priorUtxoScript = null
    for (let i = 0; i < priorTransaction.outs.length; i++) {
      const output = priorTransaction.outs[i]
      if (BigInt(output.value) === 1007n) {
        priorUtxoIndex = i
        priorUtxoScript = output.script
        break
      }
    }

    if (priorUtxoIndex === -1) {
      throw new Error(`No output with value 1007 sats found in transaction ${priorTx}`)
    }

    // Get UTXOs from main account
    const scriptHash = await this._getScriptHash()
    const unspent = await this._electrumClient.blockchainScripthash_listunspent(scriptHash)

    if (!unspent || unspent.length === 0) {
      throw new Error(`No unspent outputs available for address ${address}`)
    }

    // Get the script for the account's address
    const fromAddressScriptHex = btcAddress.toOutputScript(address, network).toString('hex')

    // Validate priorAcct parameter
    if (!priorAcct) {
      throw new Error('priorAcct parameter is required to sign the prior transaction UTXO')
    }

    // Get priorAcct address and verify network matches
    const priorAcctAddress = await priorAcct.getAddress()
    const priorAcctNetwork = priorAcct._network
    if (priorAcctNetwork.name !== network.name) {
      throw new Error('priorAcct network must match the current account network')
    }

    // Verify that the priorTx UTXO script matches the priorAcct's address script
    // This ensures priorAcct can sign the input
    const priorAcctScriptHex = btcAddress.toOutputScript(priorAcctAddress, network).toString('hex')
    const priorUtxoScriptHex = priorUtxoScript.toString('hex')
    if (priorUtxoScriptHex !== priorAcctScriptHex) {
      throw new Error(`Prior transaction UTXO script does not match priorAcct address. Cannot sign this input.`)
    }

    // Create OP_RETURN script from hex
    const opReturnScript = this.createOpReturnScriptFromHex(hex)

    // Estimate transaction size for fee calculation
    // Base: ~10-11 vbytes
    // Inputs: 2 inputs (priorTx UTXO + main account UTXO)
    //   - P2WPKH: ~68 vbytes per input
    //   - P2TR: ~58 vbytes per input
    // Outputs: 3 outputs (to address + OP_RETURN + change)
    //   - P2WPKH: ~31 vbytes per output
    //   - P2TR: ~43 vbytes per output
    const isP2WPKH = address.toLowerCase().startsWith('bc1q') || address.toLowerCase().startsWith('tb1q')
    const inputVBytes = isP2WPKH ? 68 : 58
    const outputVBytes = isP2WPKH ? 31 : 43
    const txOverheadVBytes = 11
    const estimatedVSize = txOverheadVBytes + (2 * inputVBytes) + (3 * outputVBytes)
    const estimatedFee = BigInt(estimatedVSize) * feeRate

    // Calculate total needed: sendValue + estimatedFee
    const totalNeeded = sendValue + estimatedFee

    // Select UTXO from main account to fund the transaction
    // We need at least totalNeeded amount
    let selectedUtxo = null
    for (const utxo of unspent) {
      if (BigInt(utxo.value) >= totalNeeded) {
        selectedUtxo = utxo
        break
      }
    }

    // If no single UTXO is large enough, try to find one that's close
    if (!selectedUtxo) {
      // Sort by value descending and take the largest
      const sortedUtxos = [...unspent].sort((a, b) => Number(b.value) - Number(a.value))
      if (sortedUtxos.length > 0) {
        selectedUtxo = sortedUtxos[0]
      }
    }

    if (!selectedUtxo) {
      throw new Error(`Insufficient balance to fund transaction. Need at least ${totalNeeded.toString()} sats.`)
    }

    // Construct UTXO list with both inputs
    const utxos = [
      {
        tx_hash: priorTx,
        tx_pos: priorUtxoIndex,
        value: 1007,
        vout: {
          value: 1007n,
          scriptPubKey: { hex: priorUtxoScript.toString('hex') }
        }
      },
      {
        tx_hash: selectedUtxo.tx_hash,
        tx_pos: selectedUtxo.tx_pos,
        value: selectedUtxo.value,
        vout: {
          value: this._toBigInt(selectedUtxo.value),
          scriptPubKey: { hex: fromAddressScriptHex }
        }
      }
    ]

    // Calculate total input value
    const totalInput = utxos.reduce((sum, u) => sum + this._toBigInt(u.value), 0n)

    // Recalculate actual fee based on transaction size
    // We'll build the transaction and adjust if needed
    const changeValue = totalInput - sendValue - estimatedFee

    // Build transaction with multi-account signing
    // First input (priorTx UTXO) is signed by priorAcct
    // Second input (main account UTXO) is signed by this account
    const tx = await this._buildMultiAccountTransaction({
      utxos,
      to,
      value: sendValue,
      fee: estimatedFee,
      feeRate,
      changeValue: changeValue > 0n ? changeValue : 0n,
      additionalOutputs: [{ script: opReturnScript, value: 0 }],
      priorAcct
    })

    // Broadcast the transaction
    await this._electrumClient.blockchainTransaction_broadcast(tx.hex)

    return { hash: tx.txid, fee: tx.fee }
  }

  /**
   * Transfers a token to another address.
   *
   * @param {TransferOptions} options - The transfer's options.
   * @returns {Promise<TransferResult>} The transfer's result.
   */
  async transfer (options) {
    throw new Error("The 'transfer' method is not supported on the bitcoin blockchain.")
  }

  /**
   * Returns the bitcoin transfers history of the account.
   *
   * @param {Object} [options] - The options.
   * @param {"incoming" | "outgoing" | "all"} [options.direction] - If set, only returns transfers with the given direction (default: "all").
   * @param {number} [options.limit] - The number of transfers to return (default: 10).
   * @param {number} [options.skip] - The number of transfers to skip (default: 0).
   * @returns {Promise<BtcTransfer[]>} The bitcoin transfers.
   */
  async getTransfers (options = {}) {
    const {
      direction = 'all',
      limit = 10,
      skip = 0
    } = options

    const network = this._network
    const scriptHash = await this._getScriptHash()
    const history = await this._electrumClient.blockchainScripthash_getHistory(scriptHash)

    const address = await this.getAddress()
    // toOutputScript automatically handles both Bech32 (P2WPKH) and Bech32m (P2TR) addresses
    const myScript = btcAddress.toOutputScript(address, network)

    const txCache = new LRUCache({ max: MAX_CACHE_ENTRIES })
    const prevUtxoCache = new LRUCache({ max: MAX_CACHE_ENTRIES })
    const limitConcurrency = pLimit(MAX_CONCURRENT_REQUESTS)

    const fetchTransaction = async (txid) => {
      const cached = txCache.get(txid)
      if (cached) return cached
      const hex = await limitConcurrency(() =>
        this._electrumClient.blockchainTransaction_get(txid, false)
      )
      const tx = Transaction.fromHex(hex)
      txCache.set(txid, tx)
      return tx
    }

    const getPrevUtxo = async (input) => {
      const prevTxId = Buffer.from(input.hash).reverse().toString('hex')
      const prevKey = `${prevTxId}:${input.index}`
      const cached = prevUtxoCache.get(prevKey)
      if (cached !== undefined) return cached
      const isCoinbasePrevUtxo = prevTxId === '0'.repeat(64)
      if (isCoinbasePrevUtxo) { prevUtxoCache.set(prevKey, null); return null }
      const prevTx = await fetchTransaction(prevTxId)
      const prevTxUtxo = prevTx.outs[input.index] || null
      const prevUtxo = prevTxUtxo ? { script: prevTxUtxo.script, value: BigInt(prevTxUtxo.value) } : null
      prevUtxoCache.set(prevKey, prevUtxo)
      return prevUtxo
    }

    const processHistoryItem = async (item) => {
      let tx
      try {
        tx = await fetchTransaction(item.tx_hash)
      } catch (err) {
        console.warn('Failed to fetch transaction', item.tx_hash, err)
        return []
      }
      const prevUtxos = await Promise.all(
        tx.ins.map((input) => getPrevUtxo(input).catch((err) => {
          console.warn('Failed to fetch prevUtxo', input, err)
          return null
        }))
      )

      let totalInputValue = 0n
      let isOutgoingTx = false
      for (const prevUtxo of prevUtxos) {
        if (!prevUtxo || typeof prevUtxo.value !== 'bigint') continue
        totalInputValue += prevUtxo.value
        const isOurPrevUtxo = prevUtxo.script && prevUtxo.script.equals(myScript)
        isOutgoingTx = isOutgoingTx || isOurPrevUtxo
      }

      const utxos = tx.outs
      let totalUtxoValue = 0n
      for (const utxo of utxos) totalUtxoValue += BigInt(utxo.value)

      const fee = totalInputValue > 0n ? totalInputValue - totalUtxoValue : null

      const rows = []
      for (let vout = 0; vout < utxos.length; vout++) {
        const utxo = utxos[vout]
        const utxoValue = BigInt(utxo.value)
        const isSelfUtxo = utxo.script.equals(myScript)
        let directionType = null
        if (isSelfUtxo && !isOutgoingTx) directionType = 'incoming'
        else if (!isSelfUtxo && isOutgoingTx) directionType = 'outgoing'
        else if (isSelfUtxo && isOutgoingTx) directionType = 'change'
        else continue
        if (directionType === 'change') continue
        if (direction !== 'all' && direction !== directionType) continue

        let recipient = null
        try {
          // fromOutputScript automatically handles both P2WPKH and P2TR output scripts
          // P2WPKH scripts decode to Bech32 addresses, P2TR scripts decode to Bech32m addresses
          recipient = btcAddress.fromOutputScript(utxo.script, network)
        } catch (err) {
          console.warn('Failed to decode recipient address', utxo, err)
        }

        rows.push({
          txid: item.tx_hash,
          height: item.height,
          value: utxoValue,
          vout,
          direction: directionType,
          recipient,
          fee,
          address
        })
      }
      return rows
    }

    const transfers = []
    const filteredHistory = history.slice(skip)
    for (let i = 0; i < filteredHistory.length && transfers.length < limit; i += REQUEST_BATCH_SIZE) {
      const window = filteredHistory.slice(i, i + REQUEST_BATCH_SIZE)
      const settled = await Promise.allSettled(
        window.map((item) =>
          processHistoryItem(item).catch((err) => {
            console.warn('Failed to process history item', item, err)
            return []
          })
        )
      )
      for (const res of settled) {
        if (transfers.length >= limit) break
        if (res.status !== 'fulfilled') continue
        const rows = res.value || []
        for (const row of rows) {
          transfers.push(row)
          if (transfers.length >= limit) break
        }
      }
    }

    return transfers
  }

  /**
   * Returns a read-only copy of the account.
   *
   * @returns {Promise<WalletAccountReadOnlyBtc>} The read-only account.
   */
  async toReadOnlyAccount () {
    const btcReadOnlyAccount = new WalletAccountReadOnlyBtc(this._address, this._config)

    return btcReadOnlyAccount
  }

  /**
   * Creates an OP_RETURN script for embedding arbitrary data in a transaction.
   * Works for both P2WPKH and P2TR script types.
   *
   * @param {string} data - The data to embed (will be UTF-8 encoded).
   * @returns {Buffer} The OP_RETURN script as a Buffer.
   */
  createOpReturnScript (data) {
    const dataBuffer = Buffer.from(data, 'utf8')
    const dataLength = dataBuffer.length

    // OP_RETURN (0x6a) + push opcode + data
    // For data <= 75 bytes, use OP_PUSHBYTES_<n> (0x01-0x4b)
    // For larger data, we'd need OP_PUSHDATA1/2/4, but 75 bytes is usually enough
    if (dataLength > 75) {
      throw new Error('OP_RETURN data cannot exceed 75 bytes')
    }

    const script = Buffer.allocUnsafe(1 + 1 + dataLength)
    script[0] = 0x6a // OP_RETURN
    script[1] = dataLength // OP_PUSHBYTES_<n>
    dataBuffer.copy(script, 2)

    return script
  }

  /**
   * Builds a transaction without broadcasting it.
   * Supports additional outputs including OP_RETURN scripts.
   * Logic is isolated by script_type (P2TR vs P2WPKH).
   *
   * @param {Object} options - Transaction options.
   * @param {string} options.recipient - The recipient's Bitcoin address.
   * @param {number | bigint} options.amount - The amount to send (in satoshis).
   * @param {number | bigint} options.feeRate - The fee rate (in sats/vB).
   * @param {Array<Object>} [options.additionalOutputs] - Additional outputs to include.
   *   Each output can be:
   *   - { address: string, value: number } for regular address outputs
   *   - { script: Buffer, value: 0 } for OP_RETURN outputs
   * @returns {Promise<{txid: string, hex: string, fee: bigint, vsize: number}>} The transaction details.
   * @private
   */
  async _getTransaction ({ recipient, amount, feeRate, additionalOutputs = [] }) {
    const address = await this.getAddress()

    // Validate script_type is supported
    if (this._scriptType !== 'P2TR' && this._scriptType !== 'P2WPKH') {
      throw new Error(`Transaction composition not yet supported for script_type: ${this._scriptType}`)
    }

    feeRate = this._toBigInt(feeRate)
    amount = this._toBigInt(amount)

    // Plan the spend (this handles UTXO selection and fee calculation)
    const { utxos, fee, changeValue } = await this._planSpend({
      fromAddress: address,
      toAddress: recipient,
      amount,
      feeRate
    })

    // Build and sign the transaction with additional outputs
    const tx = await this._getRawTransaction({
      utxos,
      to: recipient,
      value: amount,
      fee,
      feeRate,
      changeValue,
      additionalOutputs
    })

    return {
      txid: tx.txid,
      hex: tx.hex,
      fee: tx.fee,
      vsize: tx.vsize
    }
  }

  /**
   * Disposes the wallet account, erasing the private key from memory and closing the connection with the electrum server.
   */
  dispose () {
    sodium_memzero(this._account.privateKey)
    sodium_memzero(this._account.chainCode)

    sodium_memzero(this._masterNode.privateKey)
    sodium_memzero(this._masterNode.chainCode)

    this._account = undefined

    this._masterNode = undefined

    this._electrumClient.close()
  }

  /**
   * Builds and signs a raw transaction with inputs from multiple accounts.
   * First input (index 0) is signed by priorAcct, second input (index 1) is signed by this account.
   * For P2TR (Taproot) transactions, uses Schnorr signatures (BIP-340) automatically.
   * For P2WPKH transactions, uses ECDSA signatures.
   * Supports additional outputs including OP_RETURN scripts.
   *
   * @private
   * @param {Object} options - Transaction options.
   * @param {Array} options.utxos - The UTXOs to spend (first from priorAcct, second from this account).
   * @param {string} options.to - The recipient's address.
   * @param {number | bigint} options.value - The amount to send.
   * @param {number | bigint} options.fee - The transaction fee.
   * @param {number | bigint} options.feeRate - The fee rate.
   * @param {number | bigint} options.changeValue - The change amount.
   * @param {Array<Object>} [options.additionalOutputs] - Additional outputs to include.
   * @param {WalletAccountBtc} options.priorAcct - The account to sign the first input.
   * @returns {Promise<{txid: string, hex: string, fee: bigint, vsize: number}>} The transaction details.
   */
  async _buildMultiAccountTransaction ({ utxos, to, value, fee, feeRate, changeValue, additionalOutputs = [], priorAcct }) {
    feeRate = this._toBigInt(feeRate)
    if (feeRate < 1n) feeRate = 1n
    value = this._toBigInt(value)
    changeValue = this._toBigInt(changeValue)
    fee = this._toBigInt(fee)

    const legacyPrevTxCache = new Map()
    const getPrevTxHex = async (txid) => {
      if (legacyPrevTxCache.has(txid)) return legacyPrevTxCache.get(txid)
      const hex = await this._electrumClient.blockchainTransaction_get(txid, false)
      legacyPrevTxCache.set(txid, hex)
      return hex
    }

    const buildAndSign = async (rcptVal, chgVal) => {
      if (!this._masterNode || !this._account) {
        throw new Error('Wallet account has been disposed or not properly initialized. Cannot build transaction.')
      }

      if (!priorAcct._masterNode || !priorAcct._account) {
        throw new Error('Prior account has been disposed or not properly initialized. Cannot build transaction.')
      }

      const psbt = new Psbt({ network: this._network })

      // Add inputs - first input from priorAcct, second from this account
      for (let i = 0; i < utxos.length; i++) {
        const utxo = utxos[i]
        const account = i === 0 ? priorAcct : this

        if (account._scriptType === 'P2TR') {
          // P2TR (Taproot) input creation
          const inputData = {
            hash: utxo.tx_hash,
            index: utxo.tx_pos,
            witnessUtxo: {
              script: Buffer.from(utxo.vout.scriptPubKey.hex, 'hex'),
              value: Number(utxo.value)
            },
            tapInternalKey: account._internalPubkey
          }
          psbt.addInput(inputData)
          const inputIndex = psbt.inputCount - 1
          const input = psbt.data.inputs[inputIndex]
          if (input) {
            input.tapBip32Derivation = [{
              masterFingerprint: account._masterNode.fingerprint,
              path: account._path,
              pubkey: Buffer.from(account._internalPubkey),
              leafHashes: []
            }]
          }
        } else if (account._bip === 84) {
          // P2WPKH (Native SegWit) input creation
          psbt.addInput({
            hash: utxo.tx_hash,
            index: utxo.tx_pos,
            witnessUtxo: {
              script: Buffer.from(utxo.vout.scriptPubKey.hex, 'hex'),
              value: Number(utxo.value)
            },
            bip32Derivation: [{
              masterFingerprint: account._masterNode.fingerprint,
              path: account._path,
              pubkey: account._account.publicKey
            }]
          })
        } else {
          // P2PKH (Legacy) input creation
          const prevHex = await getPrevTxHex(utxo.tx_hash)
          psbt.addInput({
            hash: utxo.tx_hash,
            index: utxo.tx_pos,
            nonWitnessUtxo: Buffer.from(prevHex, 'hex'),
            bip32Derivation: [{
              masterFingerprint: account._masterNode.fingerprint,
              path: account._path,
              pubkey: account._account.publicKey
            }]
          })
        }
      }

      psbt.addOutput({ address: to, value: Number(rcptVal) })

      // Add additional outputs (OP_RETURN scripts or regular address outputs)
      for (const output of additionalOutputs) {
        if (output.script) {
          if (output.value !== 0 && output.value !== 0n) {
            throw new Error('OP_RETURN outputs must have value 0')
          }
          psbt.addOutput({ script: output.script, value: 0 })
        } else if (output.address) {
          const outputValue = typeof output.value === 'bigint' ? Number(output.value) : output.value
          psbt.addOutput({ address: output.address, value: Number(outputValue) })
        } else {
          throw new Error('Additional output must have either "script" or "address" property')
        }
      }

      if (chgVal > 0n) psbt.addOutput({ address: await this.getAddress(), value: Number(chgVal) })

      // Sign inputs individually - first with priorAcct, second with this account
      for (let i = 0; i < utxos.length; i++) {
        const account = i === 0 ? priorAcct : this

        if (account._scriptType === 'P2TR') {
          // Taproot signing
          const { output } = payments.p2tr({
            internalPubkey: account._internalPubkey,
            network: account._network
          })
          const tweakedOutputPubkey = output.slice(2, 34)
          const tapTweakHashValue = tapTweakHash(Buffer.from(account._internalPubkey), undefined)
          const verifiedTweakedResult = tweakKey(Buffer.from(account._internalPubkey), undefined)
          const verifiedTweakedPubkeyBuf = verifiedTweakedResult.x

          let internalPrivKey = Buffer.from(account._account.privateKey)
          const internalPubKeyFull = Buffer.from(account._account.publicKey)
          const internalPubKeyHasOddY = (internalPubKeyFull[0] & 1) === 1

          const secp256k1Order = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141')
          if (internalPubKeyHasOddY) {
            const internalPrivKeyBigInt = BigInt('0x' + internalPrivKey.toString('hex'))
            const negatedBigInt = (secp256k1Order - internalPrivKeyBigInt) % secp256k1Order
            const negatedHex = negatedBigInt.toString(16).padStart(64, '0')
            internalPrivKey = Buffer.from(negatedHex, 'hex')
          }

          const tweakedPrivKeyDirect = Buffer.from(ecc.privateAdd(internalPrivKey, tapTweakHashValue))
          let tweakedPrivKey
          if (verifiedTweakedResult.parity === 1) {
            const tweakedPrivKeyBigInt = BigInt('0x' + tweakedPrivKeyDirect.toString('hex'))
            const negatedBigInt = (secp256k1Order - tweakedPrivKeyBigInt) % secp256k1Order
            const negatedHex = negatedBigInt.toString(16).padStart(64, '0')
            tweakedPrivKey = Buffer.from(negatedHex, 'hex')
          } else {
            tweakedPrivKey = tweakedPrivKeyDirect
          }

          const taprootSigner = {
            publicKey: tweakedOutputPubkey,
            network: account._network,
            signSchnorr: (hash) => ecc.signSchnorr(hash, tweakedPrivKey)
          }
          psbt.signInput(i, taprootSigner)
        } else {
          // P2WPKH and P2PKH use standard ECDSA signatures with HD derivation
          psbt.signInputHD(i, account._masterNode)
        }
      }

      psbt.finalizeAllInputs()

      return psbt.extractTransaction()
    }

    let currentRecipientAmnt = value
    let currentChange = changeValue

    let tx = await buildAndSign(currentRecipientAmnt, currentChange)
    let vsize = tx.virtualSize()
    let requiredFee = BigInt(vsize) * feeRate

    if (requiredFee <= fee) {
      return { txid: tx.getId(), hex: tx.toHex(), fee, vsize }
    }

    const dustLimit = this._dustLimit

    const delta = requiredFee - fee
    fee = requiredFee

    if (currentChange > 0n) {
      let newChange = currentChange - delta
      if (newChange <= dustLimit) newChange = 0n
      currentChange = newChange
      tx = await buildAndSign(currentRecipientAmnt, currentChange)
    } else {
      const newRecipientAmnt = currentRecipientAmnt - delta
      if (newRecipientAmnt <= dustLimit) {
        throw new Error(`The amount after fees must be bigger than the dust limit (= ${dustLimit}).`)
      }
      currentRecipientAmnt = newRecipientAmnt
      tx = await buildAndSign(currentRecipientAmnt, currentChange)
    }

    vsize = tx.virtualSize()
    requiredFee = BigInt(vsize) * feeRate
    if (requiredFee > fee) throw new Error('Fee shortfall after output rebalance.')

    return { txid: tx.getId(), hex: tx.toHex(), fee, vsize }
  }

  /**
   * Builds and signs a raw transaction.
   * For P2TR (Taproot) transactions, uses Schnorr signatures (BIP-340) automatically.
   * For P2WPKH transactions, uses ECDSA signatures.
   * Supports additional outputs including OP_RETURN scripts.
   * Logic is isolated by script_type (P2TR vs P2WPKH).
   *
   * @private
   * @param {Object} options - Transaction options.
   * @param {Array} options.utxos - The UTXOs to spend.
   * @param {string} options.to - The recipient's address.
   * @param {number | bigint} options.value - The amount to send.
   * @param {number | bigint} options.fee - The transaction fee.
   * @param {number | bigint} options.feeRate - The fee rate.
   * @param {number | bigint} options.changeValue - The change amount.
   * @param {Array<Object>} [options.additionalOutputs] - Additional outputs to include.
   */
  async _getRawTransaction ({ utxos, to, value, fee, feeRate, changeValue, additionalOutputs = [] }) {
    feeRate = this._toBigInt(feeRate)
    if (feeRate < 1n) feeRate = 1n
    value = this._toBigInt(value)
    changeValue = this._toBigInt(changeValue)
    fee = this._toBigInt(fee)

    const legacyPrevTxCache = new Map()
    const getPrevTxHex = async (txid) => {
      if (legacyPrevTxCache.has(txid)) return legacyPrevTxCache.get(txid)
      const hex = await this._electrumClient.blockchainTransaction_get(txid, false)
      legacyPrevTxCache.set(txid, hex)
      return hex
    }

    const buildAndSign = async (rcptVal, chgVal) => {
      if (!this._masterNode || !this._account) {
        throw new Error('Wallet account has been disposed or not properly initialized. Cannot build transaction.')
      }

      // Validate P2TR-specific initialization
      if (this._scriptType === 'P2TR') {
        if (!this._internalPubkey || !Buffer.isBuffer(this._internalPubkey) || this._internalPubkey.length !== 32) {
          throw new Error('P2TR wallet not properly initialized. Internal public key is missing or invalid. Expected 32-byte Buffer.')
        }
      }

      const psbt = new Psbt({ network: this._network })

      for (const utxo of utxos) {
        if (this._scriptType === 'P2TR') {
          // P2TR (Taproot) input creation for BIP-86
          // For BIP-86 single-key spends, the internal key is the BIP32 derived public key (without prefix)
          // Taproot uses Schnorr signatures (BIP-340) instead of ECDSA
          // Note: We're omitting tapBip32Derivation to work around a validation bug in bitcoinjs-lib v6.1.7
          // We'll sign manually using signTaprootInput with a custom signer
          const inputData = {
            hash: utxo.tx_hash,
            index: utxo.tx_pos,
            witnessUtxo: {
              script: Buffer.from(utxo.vout.scriptPubKey.hex, 'hex'),
              value: Number(utxo.value)
            },
            tapInternalKey: this._internalPubkey
            // tapBip32Derivation omitted due to validation bug - we'll sign manually
          }
          psbt.addInput(inputData)
          // Workaround: Directly modify PSBT internal data to bypass validation bug
          // This is non-standard but works around the validation issue in bitcoinjs-lib v6.1.7
          // We access the internal data structure and add tapBip32Derivation directly
          const inputIndex = psbt.inputCount - 1
          const input = psbt.data.inputs[inputIndex]
          if (input) {
            input.tapBip32Derivation = [{
              masterFingerprint: this._masterNode.fingerprint,
              path: this._path,
              pubkey: Buffer.from(this._internalPubkey), // Use internal pubkey (32 bytes) to match signer's publicKey
              leafHashes: [] // Empty array for key path spends (BIP86 Taproot)
            }]
          }
        } else if (this._bip === 84) {
          // P2WPKH (Native SegWit) input creation
          psbt.addInput({
            hash: utxo.tx_hash,
            index: utxo.tx_pos,
            witnessUtxo: {
              script: Buffer.from(utxo.vout.scriptPubKey.hex, 'hex'),
              value: Number(utxo.value)
            },
            bip32Derivation: [{
              masterFingerprint: this._masterNode.fingerprint,
              path: this._path,
              pubkey: this._account.publicKey
            }]
          })
        } else {
          // P2PKH (Legacy) input creation
          const prevHex = await getPrevTxHex(utxo.tx_hash)
          psbt.addInput({
            hash: utxo.tx_hash,
            index: utxo.tx_pos,
            nonWitnessUtxo: Buffer.from(prevHex, 'hex'),
            bip32Derivation: [{
              masterFingerprint: this._masterNode.fingerprint,
              path: this._path,
              pubkey: this._account.publicKey
            }]
          })
        }
      }

      psbt.addOutput({ address: to, value: Number(rcptVal) })

      // Add additional outputs (OP_RETURN scripts or regular address outputs)
      // Logic works for both P2TR and P2WPKH script types
      for (const output of additionalOutputs) {
        if (output.script) {
          // OP_RETURN output (value must be 0)
          if (output.value !== 0 && output.value !== 0n) {
            throw new Error('OP_RETURN outputs must have value 0')
          }
          psbt.addOutput({ script: output.script, value: 0 })
        } else if (output.address) {
          // Regular address output
          // Convert BigInt to Number explicitly to avoid mixing BigInt and Number
          const outputValue = typeof output.value === 'bigint' ? Number(output.value) : output.value
          psbt.addOutput({ address: output.address, value: Number(outputValue) })
        } else {
          throw new Error('Additional output must have either "script" or "address" property')
        }
      }

      if (chgVal > 0n) psbt.addOutput({ address: await this.getAddress(), value: Number(chgVal) })

      // Sign all inputs
      // For Taproot inputs, use signTaprootInput which handles Schnorr signatures (BIP-340)
      // signInputHD doesn't support Taproot, so we use the Taproot-specific signing method
      // For P2WPKH (BIP-84) and P2PKH (BIP-44), use signInputHD
      if (this._scriptType === 'P2TR') {
        // For Taproot key path spends, we need to tweak the private key for signing
        // Get the tweaked output key from the address (p2tr payment)
        const { output } = payments.p2tr({
          internalPubkey: this._internalPubkey,
          network: this._network
        })
        // Extract the tweaked output public key from the output script
        // This is the actual public key that corresponds to the address and must match what's in the UTXO
        const tweakedOutputPubkey = output.slice(2, 34) // Skip OP_1 (0x51) and get 32-byte x-only pubkey
        
        // Use bitcoinjs-lib's tapTweakHash function to calculate the tapTweak hash
        // For BIP-86 key path spends, merkle_root (h) is undefined (single-key spends)
        const tapTweakHashValue = tapTweakHash(Buffer.from(this._internalPubkey), undefined)
        
        // Verify the tapTweak calculation using bitcoinjs-lib's tweakKey function
        // This should match what payments.p2tr() does internally
        const verifiedTweakedResult = tweakKey(Buffer.from(this._internalPubkey), undefined)
        if (!verifiedTweakedResult || !verifiedTweakedResult.x || verifiedTweakedResult.x.length !== 32) {
          throw new Error('Failed to verify tapTweak calculation using bitcoinjs-lib tweakKey')
        }
        const verifiedTweakedPubkeyBuf = verifiedTweakedResult.x
        
        // Ensure our tapTweak calculation matches what bitcoinjs-lib expects
        if (!verifiedTweakedPubkeyBuf.equals(tweakedOutputPubkey)) {
          throw new Error(`tapTweak calculation mismatch: calculated=${verifiedTweakedPubkeyBuf.toString('hex')}, expected=${tweakedOutputPubkey.toString('hex')}. This indicates an issue with the tapTweak hash calculation.`)
        }
        
        // For Taproot key path spends, we need to tweak the private key correctly.
        // The tweaked output key Q = P + H(P||0x00)*G where P is the internal pubkey.
        // If the internal pubkey P has odd y-coordinate, we use -P instead, which means
        // we need to negate the internal private key before tweaking.
        // Then, if the resulting tweaked point Q has odd y-coordinate, we negate the tweaked private key.
        
        // Get the internal private key and check if internal pubkey has odd y-coordinate
        let internalPrivKey = Buffer.from(this._account.privateKey)
        const internalPubKeyFull = Buffer.from(this._account.publicKey) // 33-byte compressed public key
        const internalPubKeyHasOddY = (internalPubKeyFull[0] & 1) === 1 // Check if y-coordinate is odd
        
        // If internal pubkey has odd y-coordinate, negate the internal private key
        // This ensures we're working with the point that has even y-coordinate
        const secp256k1Order = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141')
        if (internalPubKeyHasOddY) {
          const internalPrivKeyBigInt = BigInt('0x' + internalPrivKey.toString('hex'))
          const negatedBigInt = (secp256k1Order - internalPrivKeyBigInt) % secp256k1Order
          const negatedHex = negatedBigInt.toString(16).padStart(64, '0')
          internalPrivKey = Buffer.from(negatedHex, 'hex')
        }
        
        // Calculate tweaked private key: tweaked_privkey = internal_privkey + tapTweakHash
        const tweakedPrivKeyDirect = Buffer.from(ecc.privateAdd(internalPrivKey, tapTweakHashValue))
        if (!tweakedPrivKeyDirect) {
          throw new Error('Failed to tweak private key')
        }
        
        // The parity from tweakKey tells us if the tweaked point has odd y-coordinate
        // If parity=1 (odd y), we need to negate the tweaked private key
        // tweaked_privkey = n - tweaked_privkey_direct mod n
        let tweakedPrivKey
        if (verifiedTweakedResult.parity === 1) {
          // Negate: n - k mod n
          const tweakedPrivKeyBigInt = BigInt('0x' + tweakedPrivKeyDirect.toString('hex'))
          const negatedBigInt = (secp256k1Order - tweakedPrivKeyBigInt) % secp256k1Order
          const negatedHex = negatedBigInt.toString(16).padStart(64, '0')
          tweakedPrivKey = Buffer.from(negatedHex, 'hex')
        } else {
          tweakedPrivKey = tweakedPrivKeyDirect
        }
        
        // Use manual signing with Taproot signer
        // signInputHD doesn't support Taproot in bitcoinjs-lib v6.1.7, so we use signInput with a custom signer
        const taprootSigner = {
          publicKey: tweakedOutputPubkey, // Tweaked output public key (32-byte x-coordinate) from output script
          network: this._network,
          signSchnorr: (hash) => {
            // Sign with Schnorr signature using the tweaked private key
            // The tweaked private key accounts for parity: if tweaked point has odd y, we use negated key
            return ecc.signSchnorr(hash, tweakedPrivKey)
          }
        }
        utxos.forEach((_, index) => {
          // Use signInput for Taproot - it will detect Taproot inputs and use signSchnorr
          psbt.signInput(index, taprootSigner)
        })
      } else {
        // P2WPKH and P2PKH use standard ECDSA signatures with HD derivation
        utxos.forEach((_, index) => psbt.signInputHD(index, this._masterNode))
      }

      psbt.finalizeAllInputs()

      return psbt.extractTransaction()
    }

    let currentRecipientAmnt = value
    let currentChange = changeValue

    let tx = await buildAndSign(currentRecipientAmnt, currentChange)
    let vsize = tx.virtualSize()
    let requiredFee = BigInt(vsize) * feeRate

    if (requiredFee <= fee) {
      return { txid: tx.getId(), hex: tx.toHex(), fee, vsize }
    }

    const dustLimit = this._dustLimit

    const delta = requiredFee - fee
    fee = requiredFee

    if (currentChange > 0n) {
      let newChange = currentChange - delta
      if (newChange <= dustLimit) newChange = 0n
      currentChange = newChange
      tx = await buildAndSign(currentRecipientAmnt, currentChange)
    } else {
      const newRecipientAmnt = currentRecipientAmnt - delta
      if (newRecipientAmnt <= dustLimit) {
        throw new Error(`The amount after fees must be bigger than the dust limit (= ${dustLimit}).`)
      }
      currentRecipientAmnt = newRecipientAmnt
      tx = await buildAndSign(currentRecipientAmnt, currentChange)
    }

    vsize = tx.virtualSize()
    requiredFee = BigInt(vsize) * feeRate
    if (requiredFee > fee) throw new Error('Fee shortfall after output rebalance.')

    return { txid: tx.getId(), hex: tx.toHex(), fee, vsize }
  }
}
