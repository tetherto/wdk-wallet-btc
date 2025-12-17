import { WalletAccountReadOnly, TransactionResult, TransferOptions, TransferResult } from '@tetherto/wdk-wallet';
import { Transaction, Network } from 'bitcoinjs-lib';
import { MempoolElectrumConfig } from './transports/mempool-electrum-client.js';
import MempoolElectrumClient from './transports/mempool-electrum-client.js';
import ElectrumClient from './transports/electrum-client.js';
import { OutputWithValue } from '@bitcoinerlab/coinselect';

export type BtcTransactionReceipt = Transaction;

/**
 * @typedef {Object} BtcTransaction
 * @property {string} to - The transaction's recipient.
 * @property {number | bigint} value - The amount of bitcoins to send to the recipient (in satoshis).
 * @property {number} [confirmationTarget] - Optional confirmation target in blocks (default: 1).
 * @property {number | bigint} [feeRate] - Optional fee rate in satoshis per virtual byte. If provided, this value overrides the fee rate estimated from the blockchain (default: undefined).
 * */
export type BtcTransaction = {
    to: string;
    value: number | bigint;
    confirmationTarget?: number;
    feeRate?: number | bigint;
};

/**
 * @typedef {Object} BtcWalletConfig
 * @property {MempoolElectrumClient} [client] - Electrum client instance. If provided, host/port/protocol are ignored.
 * @property {string} [host] - The electrum server's hostname (default: "electrum.blockstream.info"). Ignored if client is provided.
 * @property {number} [port] - The electrum server's port (default: 50001). Ignored if client is provided.
 * @property {"tcp" | "tls" | "ssl"} [protocol] - The transport protocol to use (default: "tcp"). Ignored if client is provided.
 * @property {"bitcoin" | "regtest" | "testnet"} [network] - The name of the network to use (default: "bitcoin").
 * @property {44 | 84} [bip] - The BIP address type used for key and address derivation.
 *   - 44: [BIP-44 (P2PKH / legacy)](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)
 *   - 84: [BIP-84 (P2WPKH / native SegWit)](https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki)
 *   - Default: 84 (P2WPKH).
 * */
export type BtcWalletConfig = {
    client?: MempoolElectrumClient;
    host?: string;
    port?: number;
    protocol?: 'tcp' | 'tls' | 'ssl';
    network?: 'bitcoin' | 'regtest' | 'testnet';
    bip?: 44 | 84;
};

/**
 * @typedef {Object} BtcMaxSpendableResult
 * @property {bigint} amount - The maximum spendable amount in satoshis.
 * @property {bigint} fee - The estimated network fee in satoshis.
 * @property {bigint} changeValue - The estimated change value in satoshis.
 */
export type BtcMaxSpendableResult = {
    amount: bigint;
    fee: bigint;
    changeValue: bigint;
};

export default class WalletAccountReadOnlyBtc extends WalletAccountReadOnly {
    /**
     * Creates a new bitcoin read-only wallet account.
     *
     * @param {string} address - The account's address.
     * @param {Omit<BtcWalletConfig, 'bip'>} [config] - The configuration object.
     */
    constructor(address: string, config?: Omit<BtcWalletConfig, 'bip'>);

    /**
     * The read-only wallet account configuration.
     *
     * @protected
     * @type {Omit<BtcWalletConfig, 'bip'>}
     */
    protected _config: Omit<BtcWalletConfig, 'bip'>;

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
    quoteSendTransaction(tx: BtcTransaction): Promise<Omit<TransactionResult, 'hash'>>;

    /**
     * Quotes the costs of a transfer operation.
     *
     * @param {TransferOptions} options - The transfer's options.
     * @returns {Promise<Omit<TransferResult, 'hash'>>} The transfer's quotes.
     */
    quoteTransfer(options: TransferOptions): Promise<Omit<TransferResult, 'hash'>>;

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
     * @returns {Promise<BtcMaxSpendableResult>} The maximum spendable result.
     */
    getMaxSpendable(): Promise<BtcMaxSpendableResult>;

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
     * @param {number | bigint} tx.feeRate - The fee rate (in sats/vB).
     * @returns {Promise<{ utxos: OutputWithValue[], fee: number, changeValue: number }>} - The funding plan.
     */
    protected _planSpend(tx: {
        fromAddress: string;
        toAddress: string;
        amount: number | bigint;
        feeRate: number | bigint;
    }): Promise<{ utxos: OutputWithValue[]; fee: number; changeValue: number }>;
}
