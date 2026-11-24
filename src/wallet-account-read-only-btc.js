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

import { WalletAccountReadOnly, NoSuchElementError, TransactionError, UnsupportedOperationError, ValueError } from '@tetherto/wdk-wallet'

import { networks, Transaction } from 'bitcoinjs-lib'

import FailoverProvider from '@tetherto/wdk-failover-provider'

import { bitcoinMessage } from './crypto-engine.js'

import { assertNoBipOption, resolveNetwork } from './primitives/index.js'

import { BlockbookClient, ElectrumTcp, ElectrumSsl, ElectrumTls, ElectrumWs } from './transports/index.js'
import { planSpend, planSweep } from './primitives/psbt.js'

/** @typedef {import('./transports/index.js').MempoolElectrumConfig} MempoolElectrumConfig */
/** @typedef {import('./transports/index.js').MempoolElectrumClient} MempoolElectrumClient */
/** @typedef {import('./transports/index.js').IBtcClient} IBtcClient */
/** @typedef {import('./transports/blockbook-client.js').BlockbookClientConfig} BlockbookClientConfig */
/** @typedef {import('./transports/ws.js').ElectrumWsConfig} ElectrumWsConfig */

/** @typedef {import('./primitives/index.js').Utxo} Utxo */
/** @typedef {import('./primitives/index.js').SpendPlan} SpendPlan */
/** @typedef {import('@bitcoinerlab/descriptors').OutputInstance} OutputInstance */
/** @typedef {import('./primitives/index.js').ScriptType} ScriptType */
/** @typedef {import('bitcoinjs-lib').Network} Network */
/** @typedef {import('bitcoinjs-lib').Transaction} BtcTransactionReceipt */

/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet').TransferResult} TransferResult */
/** @typedef {import('@tetherto/wdk-wallet').TransactionReceipt} TransactionReceipt */
/** @typedef {import('@tetherto/wdk-wallet').WaitForTransactionOptions} WaitForTransactionOptions */

/**
 * The bitcoin-specific fields added to a normalized transaction receipt.
 *
 * @typedef {Object} BtcTransactionDetails
 * @property {number | null} confirmations - The confirmation depth (0 while pending, null when the chain tip can't be resolved).
 * @property {BtcTransactionReceipt} transaction - The native bitcoinjs transaction.
 */

/**
 * @typedef {Object} BtcTransaction
 * @property {string} to - The transaction's recipient.
 * @property {number | bigint} value - The amount of bitcoins to send to the recipient (in satoshis).
 * @property {number} [confirmationTarget] - Optional confirmation target in blocks (default: 1).
 * @property {number} [feeRate] - Optional fee rate in satoshis per virtual byte. If provided, this value overrides the fee rate estimated from the blockchain (default: undefined).
 */

/**
 * @typedef {BtcBlockbookHttpClientDescriptor | BtcElectrumClientDescriptor | BtcElectrumWsClientDescriptor} BtcClientDescriptor
 */

/**
 * @typedef {Object} BtcBlockbookHttpClientDescriptor
 * @property {'blockbook-http'} type - The client's type.
 * @property {BlockbookClientConfig} clientConfig - The client's configuration.
 */

/**
 * @typedef {Object} BtcElectrumWsClientDescriptor
 * @property {'electrum-ws'} type - Use a WebSocket Electrum client.
 * @property {Omit<ElectrumWsConfig, 'network'>} clientConfig - The WebSocket client configuration.
 */

/**
 * @typedef {Object} BtcElectrumClientDescriptor
 * @property {'electrum'} type - Use a TCP/TLS/SSL Electrum client.
 * @property {Omit<MempoolElectrumConfig, 'network'>} clientConfig - The Electrum client configuration.
 */

/**
 * @typedef {Object} BtcWalletConfig
 * @property {IBtcClient | BtcClientDescriptor | Array<IBtcClient | BtcClientDescriptor>} [client] - The bitcoin client, or a list of bitcoin client options for connection fallback.
 * @property {"bitcoin" | "regtest" | "testnet"} [network] - The name of the network to use (default: "bitcoin").
 * @property {ScriptType} [type] - The script type of the account's address: "legacy" (P2PKH, BIP-44) or "segwit" (P2WPKH / native SegWit, BIP-84) (default: "segwit"). Wallet classes pass it to the signers they construct.
 * @property {number} [retries] - The number of retries in the failover mechanism.
 * @property {number | bigint} [transactionMaxFee] - The maximum fee amount for sendTransaction and signTransaction operations.
 */

/**
 * @typedef {Object} BtcMaxSpendableResult
 * @property {bigint} amount - The maximum spendable amount in satoshis.
 * @property {bigint} fee - The estimated network fee in satoshis.
 * @property {bigint} changeValue - The estimated change value in satoshis.
 */

const FINAL_CONFIRMATIONS = 6

export default class WalletAccountReadOnlyBtc extends WalletAccountReadOnly {
  /**
   * Creates a new bitcoin read-only wallet account.
   *
   * @param {string} address - The account's address.
   * @param {Omit<BtcWalletConfig, 'type' | 'transactionMaxFee'>} [config] - The configuration object.
   * @throws {ValueError} If the removed `bip` option is given.
   */
  constructor (address, config = {}) {
    super(address)
    assertNoBipOption(config)

    /**
     * The read-only wallet account configuration.
     *
     * @protected
     * @type {Omit<BtcWalletConfig, 'type' | 'transactionMaxFee'>}
     */
    this._config = { ...config, network: resolveNetwork(config.network) }

    /**
     * The network.
     *
     * @protected
     * @type {Network}
     */
    this._network = networks[this._config.network]

    const clientOptions = config.client ? [config.client].flat() : [{ type: 'electrum', clientConfig: { host: 'electrum.blockstream.info', port: 50_001 } }]

    /**
     * A list of all the bitcoin client options.
     *
     * @protected
     * @type {Array<IBtcClient>}
     */
    this._clientList = clientOptions.map(client => WalletAccountReadOnlyBtc._createClient(client, this._config.network))

    /**
     * A client to interact with the bitcoin network.
     *
     * @protected
     * @type {IBtcClient}
     */
    this._client = this._clientList[0]

    if (this._clientList.length > 1) {
      const failoverProvider = new FailoverProvider({ retries: this._config.retries })
      for (const entry of this._clientList) {
        failoverProvider.addProvider(entry)
      }
      this._client = failoverProvider.initialize()
    }
  }

  /**
   * Returns the account's bitcoin balance.
   *
   * When the client reports unconfirmedOutgoing, unconfirmed incoming funds
   * aren't counted (since they aren't spendable yet) but unconfirmed
   * outgoing funds are subtracted immediately. Clients that can't compute
   * unconfirmedOutgoing fall back to netting the raw unconfirmed balance.
   *
   * @returns {Promise<bigint>} The bitcoin balance (in satoshis).
   */
  async getBalance () {
    await this._ensureConnected()

    const address = await this.getAddress()

    const { confirmed, unconfirmed, unconfirmedOutgoing } = await this._client.getBalance(address)

    if (unconfirmedOutgoing !== undefined) {
      return BigInt(confirmed - unconfirmedOutgoing)
    }

    return BigInt(confirmed + (unconfirmed || 0))
  }

  /**
   * Returns the account balance for a specific token.
   *
   * Not supported on bitcoin: the blockchain has no token accounts.
   *
   * @param {string} tokenAddress - The smart contract address of the token.
   * @returns {Promise<bigint>} The token balance (in base unit).
   * @throws {UnsupportedOperationError} Always — the bitcoin blockchain doesn't support tokens.
   */
  async getTokenBalance (tokenAddress) {
    throw new UnsupportedOperationError('getTokenBalance(tokenAddress)')
  }

  /**
   * Quotes the costs of a send transaction operation.
   *
   * @param {BtcTransaction} tx - The transaction.
   * @returns {Promise<Omit<TransactionResult, 'hash'>>} The transaction's quotes.
   * @throws {ValueError} If the amount doesn't clear the dust limit.
   * @throws {TransactionError} If the account has no unspent outputs, or its balance doesn't cover the amount and its fees.
   */
  async quoteSendTransaction ({ to, value, feeRate, confirmationTarget = 1 }) {
    await this._ensureConnected()

    const address = await this.getAddress()

    if (!feeRate) {
      feeRate = await this._client.estimateFee(confirmationTarget)
    }

    value = BigInt(value)
    const chainUtxos = await this._client.listSpendable(address)
    const { fee } = planSpend({
      fromAddress: address,
      targets: [{ address: to, value }],
      feeRate,
      network: this._network,
      chainUtxos
    })

    return { fee: BigInt(fee) }
  }

  /**
   * Quotes the costs of a transfer operation.
   *
   * Not supported on bitcoin: the blockchain has no token transfers to quote.
   *
   * @param {TransferOptions} options - The transfer's options.
   * @returns {Promise<Omit<TransferResult, 'hash'>>} The transfer's quotes.
   * @throws {UnsupportedOperationError} Always — the bitcoin blockchain doesn't support transfers.
   */
  async quoteTransfer (options) {
    throw new UnsupportedOperationError('quoteTransfer(options)')
  }

  /**
   * Returns a transaction's receipt.
   *
   * @deprecated Use {@link getTransaction} instead, which returns a normalized, finality-based receipt. The raw bitcoinjs transaction remains available on its `transaction` property.
   * @param {string} hash - The transaction's hash.
   * @returns {Promise<BtcTransactionReceipt | null>} – The receipt, or null if the transaction has not been included in a block yet.
   * @throws {ValueError} If the hash is not a valid transaction hash.
   */
  async getTransactionReceipt (hash) {
    if (!/^[0-9a-fA-F]{64}$/.test(hash)) {
      throw new ValueError("The 'getTransactionReceipt(hash)' method requires a valid transaction hash to fetch the receipt.")
    }

    await this._ensureConnected()

    const address = await this.getAddress()
    const history = await this._client.getHistory(address)
    const item = Array.isArray(history) ? history.find(h => h?.tx_hash === hash) : null

    if (!item || !item.height || item.height <= 0) {
      return null
    }

    const hex = await this._client.getTransaction(hash)

    const transaction = Transaction.fromHex(hex)

    return transaction
  }

  /**
   * Returns a normalized, finality-based receipt for a transaction.
   *
   * @param {string} hash - The transaction's hash.
   * @returns {Promise<TransactionReceipt & BtcTransactionDetails>} The normalized receipt.
   * @throws {ValueError} If the hash is not a valid transaction hash.
   * @throws {NoSuchElementError} If no transaction has been found for the given hash.
   */
  async getTransaction (hash) {
    // Normalize to lowercase: txids are case-insensitive but Electrum reports
    // them lowercase, so an uppercase input would otherwise false-miss below.
    const txid = String(hash).trim().toLowerCase()

    if (!/^[0-9a-f]{64}$/.test(txid)) {
      throw new ValueError(`Invalid transaction hash: '${hash}'.`)
    }

    await this._ensureConnected()

    const address = await this.getAddress()
    const history = await this._client.getHistory(address)
    const item = Array.isArray(history) ? history.find(h => h?.tx_hash?.toLowerCase() === txid) : null

    if (!item) {
      throw new NoSuchElementError(`No transaction found for '${txid}'.`)
    }

    const transaction = Transaction.fromHex(await this._client.getTransaction(txid))

    if (!item.height || item.height <= 0) {
      return {
        hash: txid,
        finality: 'pending',
        confirmations: 0,
        transaction
      }
    }

    const confirmations = await this._getConfirmations(item.height)

    return {
      hash: txid,
      finality: confirmations !== null && confirmations >= FINAL_CONFIRMATIONS ? 'final' : 'confirmed',
      success: true,
      block: item.height,
      confirmations,
      transaction
    }
  }

  /**
   * Blocks until a transaction reaches the requested finality target, or times out.
   *
   * Note: there is no `dropped` path on BTC. A mempool eviction (the transaction
   * disappearing from the address history) is indistinguishable from a not-yet-seen
   * transaction, so it is treated as still-pending. A dropped transaction therefore
   * surfaces as a {@link TimeoutError} rather than resolving to a `dropped` receipt.
   *
   * @param {string} hash - The transaction's hash.
   * @param {WaitForTransactionOptions} [options] - The wait options.
   * @returns {Promise<TransactionReceipt & BtcTransactionDetails>} The terminal receipt for the finality target reached (inspect `success` to tell success from revert).
   * @throws {TimeoutError} If the target is not reached before the timeout.
   */
  async waitForTransaction (hash, options = {}) {
    return await super.waitForTransaction(hash, options)
  }

  /**
   * Returns the confirmation depth for a transaction included at the given block height, or null when the chain tip can't be resolved.
   *
   * @protected
   * @param {number} height - The block height the transaction was included in.
   * @returns {Promise<number | null>} The confirmation depth, or null.
   */
  async _getConfirmations (height) {
    if (typeof this._client.getBlockHeight !== 'function') {
      return null
    }

    const tip = await this._client.getBlockHeight()

    if (!tip || tip < height) {
      return null
    }

    return tip - height + 1
  }

  /**
   * The default poll cadence for {@link waitForTransaction}, in milliseconds. Set to 30 seconds to suit bitcoin's ~10-minute block time.
   *
   * @type {number}
   */
  get defaultWaitInterval () {
    return 30000
  }

  /**
   * The default time budget for {@link waitForTransaction}, in milliseconds. Set to 1 hour to allow for bitcoin's slower inclusion and confirmation.
   *
   * @type {number}
   */
  get defaultWaitTimeout () {
    return 3600000
  }

  /**
   * Returns an estimation of the maximum spendable amount (in satoshis) that can be sent in
   * a single transaction, after subtracting the transaction fee.
   *
   * All the account's unspent outputs are swept to the recipient, so no change is left over.
   * If `opts.to` is omitted, the sweep is assumed to go to the account's own address.
   * If there are no unspent outputs, or the funds cannot cover the fee and the recipient's dust limit, the amount is 0.
   *
   * @param {Object} [opts] - Options.
   * @param {number} [opts.feeRate] - Fee rate in sat/vB. If omitted, estimated via the client.
   * @param {string} [opts.to] - The recipient's address. If omitted, the sweep is assumed to go to the account's own address.
   * @returns {Promise<BtcMaxSpendableResult>} The estimated maximum spendable result.
   * @throws {ValueError} If the transaction exceeds the maximum standard size.
   */
  async getMaxSpendable (opts = {}) {
    await this._ensureConnected()

    const fromAddress = await this.getAddress()
    const feeRate = opts.feeRate ? opts.feeRate : await this._client.estimateFee(1)
    const chainUtxos = await this._client.listSpendable(fromAddress)

    try {
      const plan = planSweep({ fromAddress, toAddress: opts.to || fromAddress, chainUtxos, network: this._network, feeRate })

      return {
        amount: plan.outputs[0].value,
        fee: plan.fee,
        changeValue: 0n
      }
    } catch (e) {
      if (!(e instanceof TransactionError)) throw e

      return {
        amount: 0n,
        fee: 0n,
        changeValue: 0n
      }
    }
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
   * A list that maps each client to a flag that is true only if the client was externally provided.
   *
   * @protected
   * @type {Array<boolean>}
   */
  get _isExternalClient () {
    if (!this._config.client) return [false]
    return [this._config.client].flat().map(client => typeof client.connect === 'function')
  }

  /**
   * Closes any internal connection with the server.
   */
  dispose () {
    for (const [i, isExternal] of this._isExternalClient.entries()) {
      if (!isExternal) {
        this._clientList[i].close()
      }
    }
  }

  /**
   * Creates a bitcoin client from a descriptor, or returns the client as-is if already instantiated.
   *
   * @protected
   * @param {IBtcClient | BtcClientDescriptor} client - The bitcoin client or client descriptor.
   * @param {"bitcoin" | "regtest" | "testnet"} [network] - The network name.
   * @returns {IBtcClient} The bitcoin client.
   */
  static _createClient (client, network) {
    if (typeof client.connect === 'function') {
      return client
    }

    const { type, clientConfig } = client

    switch (type) {
      case 'blockbook-http':
        return new BlockbookClient(clientConfig)
      case 'electrum-ws':
        return new ElectrumWs({ ...clientConfig, network })
      case 'electrum': {
        const transportConfig = { ...clientConfig, network }
        switch (clientConfig.protocol) {
          case 'tls':
            return new ElectrumTls(transportConfig)
          case 'ssl':
            return new ElectrumSsl(transportConfig)
          default:
            return new ElectrumTcp(transportConfig)
        }
      }
    }
  }

  /**
   * Ensures the client is connected.
   *
   * @protected
   * @returns {Promise<void>}
   */
  async _ensureConnected () {
    await this._client.connect()
  }
}
