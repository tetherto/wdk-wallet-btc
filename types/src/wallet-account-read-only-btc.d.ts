export default class WalletAccountReadOnlyBtc extends WalletAccountReadOnly {
    /**
     * Creates a new bitcoin read-only wallet account.
     *
     * @param {string} address - The account's address.
     * @param {Omit<BtcWalletConfig, 'bip' | 'transactionMaxFee'>} [config] - The configuration object.
     */
    constructor(address: string, config?: Omit<BtcWalletConfig, "bip" | "transactionMaxFee">);
    /**
     * The read-only wallet account configuration.
     *
     * @protected
     * @type {Omit<BtcWalletConfig, 'bip' | 'transactionMaxFee'>}
     */
    protected _config: Omit<BtcWalletConfig, "bip" | "transactionMaxFee">;
    /**
     * The network.
     *
     * @protected
     * @type {Network}
     */
    protected _network: Network;
    /**
     * A list of all the bitcoin client options.
     *
     * @protected
     * @type {Array<IBtcClient>}
     */
    protected _clientList: Array<IBtcClient>;
    /**
     * A client to interact with the bitcoin network.
     *
     * @protected
     * @type {IBtcClient}
     */
    protected _client: IBtcClient;
    /**
     * A list that maps each client to a flag that is true only if the client was externally provided.
     *
     * @protected
     * @type {Array<boolean>}
     */
    get _isExternalClient(): Array<boolean>;
    /**
     * The dust limit in satoshis based on the BIP type, cached after the first computation.
     *
     * @private
     * @type {bigint | undefined}
     */
    private _dustLimit: bigint | undefined;
    /** @private */
    private _getDustLimit;
    /**
     * Returns the account's bitcoin balance.
     *
     * @returns {Promise<bigint>} The bitcoin balance (in satoshis).
     */
    getBalance(): Promise<bigint>;
    /**
     * Returns the account balance for a specific token.
     *
     * Not supported on bitcoin: the blockchain has no token accounts.
     *
     * @param {string} tokenAddress - The smart contract address of the token.
     * @returns {Promise<bigint>} The token balance (in base unit).
     * @throws {UnsupportedOperationError} Always — the bitcoin blockchain doesn't support tokens.
     */
    getTokenBalance(tokenAddress: string): Promise<bigint>;
    /**
     * Quotes the costs of a send transaction operation.
     *
     * @param {BtcTransaction} tx - The transaction.
     * @returns {Promise<Omit<TransactionResult, 'hash'>>} The transaction's quotes.
     * @throws {ValueError} If the amount doesn't clear the dust limit, or the spend requires more inputs than allowed.
     * @throws {TransactionError} If the account has no unspent outputs, or its balance doesn't cover the amount and its fees.
     */
    quoteSendTransaction({ to, value, feeRate, confirmationTarget }: BtcTransaction): Promise<Omit<TransactionResult, "hash">>;
    /**
     * Quotes the costs of a transfer operation.
     *
     * Not supported on bitcoin: the blockchain has no token transfers to quote.
     *
     * @param {TransferOptions} options - The transfer's options.
     * @returns {Promise<Omit<TransferResult, 'hash'>>} The transfer's quotes.
     * @throws {UnsupportedOperationError} Always — the bitcoin blockchain doesn't support transfers.
     */
    quoteTransfer(options: TransferOptions): Promise<Omit<TransferResult, "hash">>;
    /**
     * Returns a transaction's receipt.
     *
     * @deprecated Use {@link getTransaction} instead, which returns a normalized, finality-based receipt. The raw bitcoinjs transaction remains available on its `transaction` property.
     * @param {string} hash - The transaction's hash.
     * @returns {Promise<BtcTransactionReceipt | null>} – The receipt, or null if the transaction has not been included in a block yet.
     * @throws {ValueError} If the hash is not a valid transaction hash.
     */
    getTransactionReceipt(hash: string): Promise<BtcTransactionReceipt | null>;
    /**
     * Returns a normalized, finality-based receipt for a transaction.
     *
     * @param {string} hash - The transaction's hash.
     * @returns {Promise<TransactionReceipt & BtcTransactionDetails>} The normalized receipt.
     * @throws {ValueError} If the hash is not a valid transaction hash.
     * @throws {NoSuchElementError} If no transaction has been found for the given hash.
     */
    getTransaction(hash: string): Promise<TransactionReceipt & BtcTransactionDetails>;
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
    waitForTransaction(hash: string, options?: WaitForTransactionOptions): Promise<TransactionReceipt & BtcTransactionDetails>;
    /**
     * Returns the confirmation depth for a transaction included at the given block height, or null when the chain tip can't be resolved.
     *
     * @protected
     * @param {number} height - The block height the transaction was included in.
     * @returns {Promise<number | null>} The confirmation depth, or null.
     */
    protected _getConfirmations(height: number): Promise<number | null>;
    /**
     * The default poll cadence for {@link waitForTransaction}, in milliseconds. Set to 30 seconds to suit bitcoin's ~10-minute block time.
     *
     * @type {number}
     */
    get defaultWaitInterval(): number;
    /**
     * The default time budget for {@link waitForTransaction}, in milliseconds. Set to 1 hour to allow for bitcoin's slower inclusion and confirmation.
     *
     * @type {number}
     */
    get defaultWaitTimeout(): number;
    /**
     * Returns an estimation of the maximum spendable amount (in satoshis) that can be sent in
     * a single transaction, after subtracting estimated transaction fees.
     *
     * The estimated maximum spendable amount can differ from the wallet's total balance.
     * A transaction can only include up to MAX_UTXO_INPUTS (default: 200) unspents.
     * Wallets holding more than this limit cannot spend their full balance in a
     * single transaction. There will likely be some satoshis left over as change.
     *
     * @param {Object} [opts] - Options.
     * @param {number | bigint} [opts.feeRate] - Fee rate in sat/vB. If omitted, estimated via the client.
     * @returns {Promise<BtcMaxSpendableResult>} The estimated maximum spendable result.
     */
    getMaxSpendable(opts?: {
        feeRate?: number | bigint;
    }): Promise<BtcMaxSpendableResult>;
    /**
     * Closes any internal connection with the server.
     */
    dispose(): void;
    /**
     * Ensures the client is connected.
     *
     * @protected
     * @returns {Promise<void>}
     */
    protected _ensureConnected(): Promise<void>;
    /**
     * Creates a bitcoin client from a descriptor, or returns the client as-is if already instantiated.
     *
     * @protected
     * @param {IBtcClient | BtcClientDescriptor} client - The bitcoin client or client descriptor.
     * @param {"bitcoin" | "regtest" | "testnet"} [network] - The network name.
     * @returns {IBtcClient} The bitcoin client.
     */
    protected static _createClient(client: IBtcClient | BtcClientDescriptor, network?: "bitcoin" | "regtest" | "testnet"): IBtcClient;
    /** @private */
    private _toBigInt;
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
     * @returns {Promise<{ utxos: OutputWithValue[], fee: bigint, changeValue: bigint }>} - The funding plan.
     * @throws {ValueError} If the amount doesn't clear the dust limit, or the spend requires more inputs than allowed.
     * @throws {TransactionError} If the account has no unspent outputs, or its balance doesn't cover the amount and its fees.
     */
    protected _planSpend({ fromAddress, toAddress, amount, feeRate }: {
        fromAddress: string;
        toAddress: string;
        amount: number | bigint;
        feeRate: number | bigint;
    }): Promise<{
        utxos: OutputWithValue[];
        fee: bigint;
        changeValue: bigint;
    }>;
    /**
     * Verifies a message's signature.
     *
     * @param {string} message - The original message.
     * @param {string} signature - The signature to verify.
     * @returns {Promise<boolean>} True if the signature is valid.
     */
    verify(message: string, signature: string): Promise<boolean>;
    /**
     * Closes any internal connection with the server.
     */
    dispose(): void;
}
export type MempoolElectrumConfig = import("./transports/index.js").MempoolElectrumConfig;
export type MempoolElectrumClient = import("./transports/index.js").MempoolElectrumClient;
export type IBtcClient = import("./transports/index.js").IBtcClient;
export type BlockbookClientConfig = import("./transports/blockbook-client.js").BlockbookClientConfig;
export type ElectrumWsConfig = import("./transports/ws.js").ElectrumWsConfig;
export type OutputWithValue = import("@bitcoinerlab/coinselect").OutputWithValue;
export type Network = import("bitcoinjs-lib").Network;
export type BtcTransactionReceipt = import("bitcoinjs-lib").Transaction;
export type TransactionResult = import("@tetherto/wdk-wallet").TransactionResult;
export type TransferOptions = import("@tetherto/wdk-wallet").TransferOptions;
export type TransferResult = import("@tetherto/wdk-wallet").TransferResult;
export type TransactionReceipt = import("@tetherto/wdk-wallet").TransactionReceipt;
export type WaitForTransactionOptions = import("@tetherto/wdk-wallet").WaitForTransactionOptions;
/**
 * The bitcoin-specific fields added to a normalized transaction receipt.
 */
export type BtcTransactionDetails = {
    /**
     * - The confirmation depth (0 while pending, null when the chain tip can't be resolved).
     */
    confirmations: number | null;
    /**
     * - The native bitcoinjs transaction.
     */
    transaction: BtcTransactionReceipt;
};
export type BtcTransaction = {
    /**
     * - The transaction's recipient.
     */
    to: string;
    /**
     * - The amount of bitcoins to send to the recipient (in satoshis).
     */
    value: number | bigint;
    /**
     * - Optional confirmation target in blocks (default: 1).
     */
    confirmationTarget?: number;
    /**
     * - Optional fee rate in satoshis per virtual byte. If provided, this value overrides the fee rate estimated from the blockchain (default: undefined).
     */
    feeRate?: number | bigint;
};
export type BtcClientDescriptor = BtcBlockbookHttpClientDescriptor | BtcElectrumClientDescriptor | BtcElectrumWsClientDescriptor;
export type BtcBlockbookHttpClientDescriptor = {
    /**
     * - The client's type.
     */
    type: "blockbook-http";
    /**
     * - The client's configuration.
     */
    clientConfig: BlockbookClientConfig;
};
export type BtcElectrumWsClientDescriptor = {
    /**
     * - Use a WebSocket Electrum client.
     */
    type: "electrum-ws";
    /**
     * - The WebSocket client configuration.
     */
    clientConfig: Omit<ElectrumWsConfig, "network">;
};
export type BtcElectrumClientDescriptor = {
    /**
     * - Use a TCP/TLS/SSL Electrum client.
     */
    type: "electrum";
    /**
     * - The Electrum client configuration.
     */
    clientConfig: Omit<MempoolElectrumConfig, "network">;
};
/**
 * The wallet-level key configuration. Wallet classes map `bip` to the signer's address type
 * (44 → "legacy", 84 → "segwit") when constructing signers.
 */
export type BtcKeyConfig = {
    /**
     * - The name of the network to use (default: "bitcoin").
     */
    network?: "bitcoin" | "regtest" | "testnet";
    /**
     * - The BIP address type: 44 (P2PKH / legacy) or 84 (P2WPKH / native SegWit) (default: 84).
     */
    bip?: 44 | 84;
};
export type BtcAccountConfig = {
    /**
     * - The bitcoin client, or a list of bitcoin client options for connection fallback.
     */
    client?: IBtcClient | BtcClientDescriptor | Array<IBtcClient | BtcClientDescriptor>;
    /**
     * - The number of retries in the failover mechanism.
     */
    retries?: number;
    /**
     * - The maximum fee amount for sendTransaction and signTransaction operations.
     */
    transactionMaxFee?: number | bigint;
};
/**
 * The wallet configuration, joining the key configuration (network, bip) with the account configuration (client, retries, transactionMaxFee).
 */
export type BtcWalletConfig = BtcKeyConfig & BtcAccountConfig;
export type BtcMaxSpendableResult = {
    /**
     * - The maximum spendable amount in satoshis.
     */
    amount: bigint;
    /**
     * - The estimated network fee in satoshis.
     */
    fee: bigint;
    /**
     * - The estimated change value in satoshis.
     */
    changeValue: bigint;
};
import { WalletAccountReadOnly } from '@tetherto/wdk-wallet';