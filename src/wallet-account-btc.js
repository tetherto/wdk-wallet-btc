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

import { address as btcAddress, Psbt, Transaction } from 'bitcoinjs-lib'
import pLimit from 'p-limit'
import { LRUCache } from 'lru-cache'
import { AssertionError, MaximumFeeExceededError, UnsupportedOperationError, ValueError } from '@tetherto/wdk-wallet'

import PrivateKeySignerBtc from './signers/private-key-signer-btc.js'
import SeedSignerBtc, { getBtcDerivationPathPrefix } from './signers/seed-signer-btc.js'
import { getSignerTypeForBip } from './signers/utils.js'
import WalletAccountReadOnlyBtc from './wallet-account-read-only-btc.js'
import { compare, fromHex, toHex } from 'uint8array-tools'

/** @typedef {import('@tetherto/wdk-wallet').IWalletAccount} IWalletAccount */

/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet').TransferResult} TransferResult */

/** @typedef {import('./wallet-account-read-only-btc.js').BtcTransaction} BtcTransaction */
/** @typedef {import('./wallet-account-read-only-btc.js').BtcWalletConfig} BtcWalletConfig */

/** @typedef {import('./signers/signer-btc.js').ISignerBtc} ISignerBtc */
/** @typedef {import('./signers/signer-btc.js').BtcSignerConfig} BtcSignerConfig */

/**
 * @typedef {Object} SignerOptions
 * @property {boolean} [shouldWipeSignerOnDisposal] - If true, wipes the signer given at construction on calls to the 'dispose' method.
 */

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

const MAX_CONCURRENT_REQUESTS = 8
const MAX_CACHE_ENTRIES = 1000
const REQUEST_BATCH_SIZE = 64
const POLLING_INTERVAL = 300

/** The derivation path of the first account, relative to the BIP root. */
const DEFAULT_ACCOUNT_PATH = "0'/0/0"

/** @implements {IWalletAccount<string>} */
export default class WalletAccountBtc extends WalletAccountReadOnlyBtc {
  /**
   * Creates a new bitcoin wallet account from a BIP-39 seed, deriving the account's key at the
   * given derivation path.
   *
   * @overload
   * @param {string | Uint8Array} seed - The wallet's BIP-39 seed phrase or seed bytes.
   * @param {string} path - The derivation path relative to the BIP root (e.g. "0'/0/0").
   * @param {BtcWalletConfig} [config] - The configuration object.
   * @throws {ValueError} If the given seed phrase is invalid, or the configured bip is not supported.
   */

  /**
   * Creates a new bitcoin wallet account from a BIP-39 seed, deriving the account's key at the
   * first account ("0'/0/0") of the configured network and bip.
   *
   * @overload
   * @param {string | Uint8Array} seed - The wallet's BIP-39 seed phrase or seed bytes.
   * @param {BtcWalletConfig} [config] - The configuration object.
   * @throws {ValueError} If the given seed phrase is invalid, or the configured bip is not supported.
   */

  /**
   * Creates a new bitcoin wallet account using a signer.
   *
   * @overload
   * @param {ISignerBtc} signer - The signer.
   * @param {Omit<BtcWalletConfig, 'network' | 'bip'> & SignerOptions} [config] - The configuration object. The network and address type are taken from the signer.
   */

  constructor (seedOrSigner, pathOrConfig = {}, config = {}) {
    const isSeed = typeof seedOrSigner === 'string' || seedOrSigner instanceof Uint8Array

    let signer, configuration
    if (isSeed) {
      const hasPath = typeof pathOrConfig === 'string'
      const path = hasPath ? pathOrConfig : DEFAULT_ACCOUNT_PATH
      const { network, bip, ...accountConfig } = hasPath ? config : pathOrConfig
      const type = getSignerTypeForBip(bip)
      signer = new SeedSignerBtc(seedOrSigner, `m/${getBtcDerivationPathPrefix({ network, type })}/${path}`, { network, type })
      configuration = accountConfig
    } else {
      signer = seedOrSigner
      configuration = pathOrConfig
    }

    super(signer.address, { ...configuration, network: signer.network })

    /**
     * If true, disposes the signer on calls to the 'dispose' method.
     *
     * @protected
     * @type {boolean}
     */
    this._shouldWipeSignerOnDisposal = isSeed || Boolean(configuration.shouldWipeSignerOnDisposal)

    /** @private */
    this._signer = signer
  }

  /**
   * Returns the account's address.
   *
   * @returns {Promise<string>} The account's address.
   */
  async getAddress () {
    return await this._signer.getAddress()
  }

  /**
   * The derivation path of this account, or null if the account's signer is not bound to a
   * derivation position (e.g. private-key signers).
   *
   * @type {string | null}
   */
  get path () {
    return this._signer.path
  }

  /**
   * The account's key pair.
   *
   * The uint8 arrays are bound to the wallet account, so any external change will reflect to the internal representation. For this reason,
   * it's strongly recommended to treat the key pair as a read-only view of the keys. While it's still technically possible to alter their
   * content, client code should never do so.
   *
   * @type {KeyPair | null}
   */
  get keyPair () {
    return this._signer.keyPair
  }

  /**
   * Creates a new bitcoin wallet account from a raw private key.
   *
   * @param {string | Uint8Array} privateKey - The raw private key (hex string or 32 bytes).
   * @param {Omit<BtcWalletConfig, 'bip'> & Pick<BtcSignerConfig, 'type'>} [config] - The wallet configuration options.
   * @returns {WalletAccountBtc} The wallet account.
   * @throws {ValueError} If the private key is not 32 bytes.
   */
  static fromPrivateKey (privateKey, config = {}) {
    const { network, type, ...accountConfig } = config
    const signer = new PrivateKeySignerBtc(privateKey, { network, type })
    return new WalletAccountBtc(signer, { ...accountConfig, shouldWipeSignerOnDisposal: true })
  }

  /**
   * Signs a message.
   *
   * @param {string} message - The message to sign.
   * @returns {Promise<string>} The message's signature.
   */
  async sign (message) {
    return this._signer.sign(message)
  }

  /**
   * Signs a transaction.
   *
   * @param {BtcTransaction} tx - The transaction to sign.
   * @returns {Promise<string>} The signed raw transaction as a hex string.
   * @throws {MaximumFeeExceededError} If the transaction's cost exceeds the maximum transaction fee option.
   * @throws {ValueError} If the amount doesn't clear the dust limit, or the spend requires more inputs than allowed.
   * @throws {TransactionError} If the account has no unspent outputs, or its balance doesn't cover the amount and its fees.
   */
  async signTransaction ({ to, value, feeRate, confirmationTarget = 1 }) {
    const { tx } = await this._buildSignedTransaction({ to, value, feeRate, confirmationTarget })

    if (this._config.transactionMaxFee !== undefined && tx.fee > this._config.transactionMaxFee) {
      throw new MaximumFeeExceededError('Exceeded maximum fee cost for transaction operation.')
    }

    return tx.hex
  }

  /**
   * Quotes the costs of a send transaction operation.
   *
   * @param {BtcTransaction | string} tx - The transaction, or a signed raw transaction as a hex string.
   * @returns {Promise<Omit<TransactionResult, 'hash'>>} The transaction's quotes.
   * @throws {ValueError} If the amount doesn't clear the dust limit, or the spend requires more inputs than allowed.
   * @throws {TransactionError} If the account has no unspent outputs, or its balance doesn't cover the amount and its fees.
   */
  async quoteSendTransaction (tx) {
    if (typeof tx === 'string') {
      await this._ensureConnected()

      const transaction = Transaction.fromHex(tx)
      const fee = await this._getSignedTransactionFee(transaction)

      return { fee }
    }

    return await super.quoteSendTransaction(tx)
  }

  /**
   * Sends a transaction.
   *
   * @param {BtcTransaction | string} tx - The transaction, or a signed raw transaction as a hex string.
   * @param {number} [timeoutMs] - Maximum milliseconds to poll for spent inputs to disappear from unspent outputs after broadcast.
   * @returns {Promise<TransactionResult>} The transaction's result.
   * @throws {MaximumFeeExceededError} If the transaction's cost exceeds the maximum transaction fee option.
   * @throws {ValueError} If the amount doesn't clear the dust limit, or the spend requires more inputs than allowed.
   * @throws {TransactionError} If the account has no unspent outputs, or its balance doesn't cover the amount and its fees.
   */
  async sendTransaction (tx, timeoutMs = 10000) {
    await this._ensureConnected()

    let hex, txid, fee, spentOutpoints

    if (typeof tx === 'string') {
      const transaction = Transaction.fromHex(tx)

      hex = tx
      txid = transaction.getId()
      fee = await this._getSignedTransactionFee(transaction)
      spentOutpoints = new Set(
        transaction.ins.map((input) => `${Buffer.from(input.hash).reverse().toString('hex')}:${input.index}`)
      )
    } else {
      const { to, value, feeRate, confirmationTarget = 1 } = tx
      const { tx: builtTx, utxos } = await this._buildSignedTransaction({ to, value, feeRate, confirmationTarget })

      hex = builtTx.hex
      txid = builtTx.txid
      fee = builtTx.fee
      spentOutpoints = new Set(utxos.map(({ tx_hash: txHash, tx_pos: txPos }) => `${txHash}:${txPos}`))
    }

    if (this._config.transactionMaxFee !== undefined && fee > this._config.transactionMaxFee) {
      throw new MaximumFeeExceededError('Exceeded maximum fee cost for transaction operation.')
    }

    const address = await this.getAddress()
    let retries = Math.ceil(timeoutMs / POLLING_INTERVAL)

    await this._client.broadcast(hex)

    while (retries > 0) {
      retries -= 1

      await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL))

      const currentUtxos = await this._client.listUnspent(address)
      const hasSpentOutpoints = currentUtxos
        .some(({ tx_hash: txHash, tx_pos: txPos }) => spentOutpoints.has(`${txHash}:${txPos}`))

      if (!hasSpentOutpoints) break
    }

    return { hash: txid, fee }
  }

  /**
   * Transfers a token to another address.
   *
   * Not supported on bitcoin: the blockchain has no tokens to transfer.
   *
   * @param {TransferOptions} options - The transfer's options.
   * @returns {Promise<TransferResult>} The transfer's result.
   * @throws {UnsupportedOperationError} Always — the bitcoin blockchain doesn't support transfers.
   */
  async transfer (options) {
    throw new UnsupportedOperationError('transfer(options)')
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
    await this._ensureConnected()

    const {
      direction = 'all',
      limit = 10,
      skip = 0
    } = options

    const network = this._network
    const address = await this.getAddress()
    const history = await this._client.getHistory(address)

    const myScript = btcAddress.toOutputScript(address, network)

    const txCache = new LRUCache({ max: MAX_CACHE_ENTRIES })
    const prevUtxoCache = new LRUCache({ max: MAX_CACHE_ENTRIES })
    const limitConcurrency = pLimit(MAX_CONCURRENT_REQUESTS)

    const fetchTransaction = async (txid) => {
      const cached = txCache.get(txid)
      if (cached) return cached
      const hex = await limitConcurrency(() =>
        this._client.getTransaction(txid)
      )
      const tx = Transaction.fromHex(hex)
      txCache.set(txid, tx)
      return tx
    }

    const getPrevUtxo = async (input) => {
      const prevTxId = toHex(Uint8Array.from(input.hash).reverse())
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
        const isOurPrevUtxo = prevUtxo.script && compare(prevUtxo.script, myScript) === 0
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
        const isSelfUtxo = compare(utxo.script, myScript) === 0
        let directionType = null
        if (isSelfUtxo && !isOutgoingTx) directionType = 'incoming'
        else if (!isSelfUtxo && isOutgoingTx) directionType = 'outgoing'
        else if (isSelfUtxo && isOutgoingTx) directionType = 'change'
        else continue
        if (directionType === 'change') continue
        if (direction !== 'all' && direction !== directionType) continue

        let recipient = null
        try {
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
    if (!this._btcReadOnlyAccount) {
      this._btcReadOnlyAccount = new WalletAccountReadOnlyBtc(await this.getAddress(), {
        ...this._config,
        client: this._client
      })
    }

    return this._btcReadOnlyAccount
  }

  /**
   * Disposes the wallet account, erasing the private key from memory and closing the connection with the server.
   * The signer given at construction is wiped only if the account owns it (see {@link SignerOptions}).
   */
  dispose () {
    if (this._shouldWipeSignerOnDisposal) {
      this._signer.dispose()
    }
    super.dispose()
  }

  /**
   * Computes the fee of a signed raw transaction by resolving the value of each
   * spent input from the blockchain and subtracting the total output value.
   *
   * @private
   * @param {Transaction} transaction - The decoded signed transaction.
   * @returns {Promise<bigint>} The fee (in satoshis).
   */
  async _getSignedTransactionFee (transaction) {
    let totalInput = 0n

    for (const input of transaction.ins) {
      const prevTxId = Buffer.from(input.hash).reverse().toString('hex')
      const prevHex = await this._client.getTransaction(prevTxId)
      const prevTx = Transaction.fromHex(prevHex)

      totalInput += BigInt(prevTx.outs[input.index].value)
    }

    let totalOutput = 0n

    for (const output of transaction.outs) {
      totalOutput += BigInt(output.value)
    }

    return totalInput - totalOutput
  }

  /** @private */
  async _getRawTransaction ({ utxos, to, value, fee, feeRate, changeValue }) {
    feeRate = this._toBigInt(feeRate)
    if (feeRate < 1n) feeRate = 1n
    value = this._toBigInt(value)
    changeValue = this._toBigInt(changeValue)
    fee = this._toBigInt(fee)

    const legacyPrevTxCache = new Map()
    const getPrevTxHex = async (txid) => {
      if (legacyPrevTxCache.has(txid)) return legacyPrevTxCache.get(txid)
      const hex = await this._client.getTransaction(txid)
      legacyPrevTxCache.set(txid, hex)
      return hex
    }

    const buildUnsignedPsbt = async (rcptVal, chgVal) => {
      const psbt = new Psbt({ network: this._network })

      for (const utxo of utxos) {
        const baseInput = {
          hash: utxo.tx_hash,
          index: utxo.tx_pos
        }

        if (this._signer.type === 'legacy') {
          const prevHex = await getPrevTxHex(utxo.tx_hash)
          psbt.addInput({
            ...baseInput,
            nonWitnessUtxo: fromHex(prevHex)
          })
        } else {
          psbt.addInput({
            ...baseInput,
            witnessUtxo: {
              script: fromHex(utxo.vout.scriptPubKey.hex),
              value: utxo.vout.value
            }
          })
        }
      }

      psbt.addOutput({ address: to, value: rcptVal })
      if (chgVal > 0n) psbt.addOutput({ address: await this.getAddress(), value: chgVal })

      return psbt
    }

    const signAndFinalize = async (psbt) => {
      const signedBase64 = await this._signer.signPsbt(psbt)
      const signed = Psbt.fromBase64(signedBase64)
      signed.finalizeAllInputs()
      return signed.extractTransaction()
    }

    let currentRecipientAmnt = value
    let currentChange = changeValue

    let unsigned = await buildUnsignedPsbt(currentRecipientAmnt, currentChange)
    let tx = await signAndFinalize(unsigned)
    let vsize = tx.virtualSize()
    let requiredFee = BigInt(vsize) * feeRate

    if (requiredFee <= fee) {
      return { txid: tx.getId(), hex: tx.toHex(), fee, vsize }
    }

    const dustLimit = await this._getDustLimit()

    const delta = requiredFee - fee
    fee = requiredFee
    if (currentChange > 0n) {
      let newChange = currentChange - delta
      if (newChange <= dustLimit) newChange = 0n
      currentChange = newChange
      unsigned = await buildUnsignedPsbt(currentRecipientAmnt, currentChange)
      tx = await signAndFinalize(unsigned)
    } else {
      const newRecipientAmnt = currentRecipientAmnt - delta
      if (newRecipientAmnt <= dustLimit) {
        throw new ValueError(`The amount after fees must be bigger than the dust limit (= ${dustLimit}).`)
      }
      currentRecipientAmnt = newRecipientAmnt
      unsigned = await buildUnsignedPsbt(currentRecipientAmnt, currentChange)
      tx = await signAndFinalize(unsigned)
    }

    vsize = tx.virtualSize()
    requiredFee = BigInt(vsize) * feeRate
    if (requiredFee > fee) throw new AssertionError('Fee shortfall after output rebalance.')

    return { txid: tx.getId(), hex: tx.toHex(), fee, vsize }
  }

  /** @private */
  async _buildSignedTransaction ({ to, value, feeRate, confirmationTarget = 1 }) {
    await this._ensureConnected()
    const address = await this.getAddress()
    if (!feeRate) {
      const feeEstimate = await this._client.estimateFee(confirmationTarget)
      feeRate = this._toBigInt(Math.max(feeEstimate * 100_000, 1))
    }
    const { utxos, fee, changeValue } = await this._planSpend({
      fromAddress: address, toAddress: to, amount: value, feeRate
    })
    const tx = await this._getRawTransaction({ utxos, to, value, fee, feeRate, changeValue })
    return { tx, utxos }
  }
}
