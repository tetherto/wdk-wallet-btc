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
     * An electrum client to interact with the bitcoin node.
     *
     * @protected
     * @type {ElectrumClient}
     */
    protected _electrumClient: ElectrumClient;
    /**
     * Returns the account's eth balance.
     *
     * @returns {Promise<bigint>} The eth balance (in weis).
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
    quoteSendTransaction(tx: BtcTransaction): Promise<Omit<TransactionResult, "hash">>;
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
     * Computes the sha-256 hash of the output script for this wallet's address, reverses the byte order,
     * and returns it as a hex string.
     *
     * @protected
     * @returns {Promise<string>} The reversed sha-256 script hash as a hex-encoded string.
     */
    protected _getScriptHash(): Promise<string>;
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
     * @param {number} tx.feeRate - The fee rate (in sats/vB).
     * @returns {Promise<{ utxos: OutputWithValue[], fee: number, changeValue: number }>} - The funding plan.
     */
    protected _planSpend({ fromAddress, toAddress, amount, feeRate }: {
        fromAddress: string;
        toAddress: string;
        amount: number | bigint;
        feeRate: number;
    }): Promise<{
        utxos: OutputWithValue[];
        fee: number;
        changeValue: number;
    }>;
}
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
};
export type BtcWalletConfig = {
    /**
     * - The electrum server's hostname (default: "electrum.blockstream.info").
     */
    host?: string;
    /**
     * - The electrum server's port (default: 50001).
     */
    port?: number;
    /**
     * The name of the network to use (default: "bitcoin").
     */
    network?: "bitcoin" | "regtest" | "testnet";
    /**
     * - The transport protocol to use (default: "tcp").
     */
    protocol?: "tcp" | "tls" | "ssl";
    /**
     * - The bip address type; available values: 44 or 84 (default: 44).
     */
    bip?: 44 | 84;
};
import { WalletAccountReadOnly } from '@tetherto/wdk-wallet';
import ElectrumClient from './electrum-client.js';
