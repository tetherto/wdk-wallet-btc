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
import { BIP32Factory } from 'bip32'
import pLimit from 'p-limit'
import { LRUCache } from 'lru-cache'

import * as bip39 from 'bip39'
import * as ecc from '@bitcoinerlab/secp256k1'
import * as bitcoinMessage from 'bitcoinjs-message'

// eslint-disable-next-line camelcase
import { sodium_memzero } from 'sodium-universal'

import WalletAccountReadOnlyBtc from './wallet-account-read-only-btc.js'

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
      /** @private */
      this._internalPubkey = account.publicKey.slice(1)
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
        // Calculate tapTweak hash (BIP-341): HashTapTweak(internal_pubkey || merkle_root)
        // For BIP-86 key path spends, merkle_root is 0x00 (single byte, not 32 bytes)
        // TapTweak uses tagged hash (BIP-340): SHA256(SHA256(tag) || SHA256(tag) || msg)
        const tapTweakTag = Buffer.from('TapTweak', 'utf8')
        const tagHash = crypto.sha256(tapTweakTag) // SHA256(tag)
        const tapTweakMsg = Buffer.concat([
          tagHash, // First SHA256(tag)
          tagHash, // Second SHA256(tag) (repeated per BIP-340 spec)
          Buffer.from(this._internalPubkey), // 32-byte internal pubkey
          Buffer.from([0x00]) // 0x00 for single-key spends (BIP-86)
        ])
        const tapTweakHash = crypto.sha256(tapTweakMsg) // Final tagged hash
        // Tweak the private key: tweaked_privkey = internal_privkey + tapTweakHash
        // Ensure private key is a Buffer (not BigInt)
        const internalPrivKey = Buffer.from(this._account.privateKey)
        const tweakedPrivKey = Buffer.from(ecc.privateAdd(internalPrivKey, tapTweakHash))
        if (!tweakedPrivKey) {
          throw new Error('Failed to tweak private key')
        }
        // Extract the x-coordinate from the output script (last 32 bytes of P2TR output)
        const tweakedOutputPubkey = output.slice(2, 34) // Skip OP_1 (0x51) and 32-byte pubkey
        const taprootSigner = {
          publicKey: tweakedOutputPubkey, // Tweaked output public key (32-byte x-coordinate)
          network: this._network,
          signSchnorr: (hash) => {
            // Sign with Schnorr signature using the tweaked private key
            return ecc.signSchnorr(hash, tweakedPrivKey)
          }
        }
        utxos.forEach((_, index) => {
          // Use signInput for Taproot - it will detect Taproot inputs and use signSchnorr
          // signTaprootInput may not exist in bitcoinjs-lib v6.1.7, so use signInput instead
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
