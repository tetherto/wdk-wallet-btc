export default class WalletAccountReadOnlyBtc extends WalletAccountReadOnly {
    /**
     * Creates a new bitcoin read-only wallet account.
     *
     * @param {string} address - The account's address.
     * @param {Omit<BtcWalletConfig, 'bip'>} [config] - The configuration object.
     */
    constructor(address: string, config?: Omit<BtcWalletConfig, "bip">);
    /**
     * The read-only wallet account configuration.
     *
     * @protected
     * @type {Omit<BtcWalletConfig, 'bip'>}
     */
    protected _config: Omit<BtcWalletConfig, "bip">;
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
     * The dust limit in satoshis based on the BIP type.
     *
     * @private
     * @type {bigint}
     */
    private _dustLimit;
    /**
     * Returns the account's bitcoin balance.
     *
     * @returns {Promise<bigint>} The bitcoin balance (in satoshis).
     */
    getBalance(): Promise<bigint>;
    /**
     * Returns the account balance for a specific token.
     *
     * @param {string} tokenAddress - The smart contract address of the token.
     * @returns {Promise<bigint>} The token balance (in base unit).
     */
    getTokenBalance(tokenAddress: string): Promise<bigint>;
    /**
     * Quotes the costs of a send transaction operation.
     *
     * @param {BtcTransaction} tx - The transaction.
     * @returns {Promise<Omit<TransactionResult, 'hash'>>} The transaction's quotes.
     */
    quoteSendTransaction({ to, value, feeRate, confirmationTarget }: BtcTransaction): Promise<Omit<TransactionResult, "hash">>;
    /**
     * Quotes the costs of a transfer operation.
     *
     * @param {TransferOptions} options - The transfer's options.
     * @returns {Promise<Omit<TransferResult, 'hash'>>} The transfer's quotes.
     */
    quoteTransfer(options: TransferOptions): Promise<Omit<TransferResult, "hash">>;
    /**
     * Returns a transaction's receipt.
     *
     * @param {string} hash - The transaction's hash.
     * @returns {Promise<BtcTransactionReceipt | null>} – The receipt, or null if the transaction has not been included in a block yet.
     */
    getTransactionReceipt(hash: string): Promise<BtcTransactionReceipt | null>;
    /**
     * Returns the maximum spendable amount (in satoshis) that can be sent in
     * a single transaction, after subtracting estimated transaction fees.
     *
     * The maximum spendable amount can differ from the wallet's total balance.
     * A transaction can only include up to MAX_UTXO_INPUTS (default: 200) unspents.
     * Wallets holding more than this limit cannot spend their full balance in a
     * single transaction.
     *
     * @param {Object} [opts] - Options.
     * @param {number | bigint} [opts.feeRate] - Fee rate in sat/vB. If omitted, estimated via the client.
     * @returns {Promise<BtcMaxSpendableResult>} The maximum spendable result.
     */
    getMaxSpendable(opts?: {
        feeRate?: number | bigint;
    }): Promise<BtcMaxSpendableResult>;
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
     * @returns {Promise<{ utxos: OutputWithValue[], fee: number, changeValue: number }>} - The funding plan.
     */
    protected _planSpend({ fromAddress, toAddress, amount, feeRate }: {
        fromAddress: string;
        toAddress: string;
        amount: number | bigint;
        feeRate: number | bigint;
    }): Promise<{
        utxos: OutputWithValue[];
        fee: number;
        changeValue: number;
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
export type OutputWithValue = import("@bitcoinerlab/coinselect").OutputWithValue;
export type Network = import("bitcoinjs-lib").Network;
export type BtcTransactionReceipt = import("bitcoinjs-lib").Transaction;
export type TransactionResult = import("@tetherto/wdk-wallet").TransactionResult;
export type TransferOptions = import("@tetherto/wdk-wallet").TransferOptions;
export type TransferResult = import("@tetherto/wdk-wallet").TransferResult;
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
export type BtcClientDescriptor =
    | { type: 'blockbook-http', clientConfig: import("./transports/blockbook-client.js").BlockbookClientConfig }
    | { type: 'electrum-ws', clientConfig: import("./transports/ws.js").ElectrumWsConfig }
    | { type: 'electrum', clientConfig: MempoolElectrumConfig };
export type BtcWalletConfig = {
    /**
     * - The bitcoin client: a pre-built IBtcClient, a descriptor { type, config }, or an array for failover.
     */
    client?: IBtcClient | BtcClientDescriptor | Array<IBtcClient | BtcClientDescriptor>;
    /**
     * - The name of the network to use (default: "bitcoin").
     */
    network?: "bitcoin" | "regtest" | "testnet";
    /**
     * - The BIP address type used for key and address derivation.
     *   - 44: [BIP-44 (P2PKH / legacy)](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)
     *   - 84: [BIP-84 (P2WPKH / native SegWit)](https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki)
     *   - Default: 84 (P2WPKH).
     */
    bip?: 44 | 84;
    /**
     * - The number of retries in the failover mechanism.
     */
    retries?: number
};
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