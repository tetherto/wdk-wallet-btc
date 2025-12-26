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
     * @type {IElectrumClient}
     */
    protected _electrumClient: IElectrumClient;
    /**
     * The dust limit in satoshis based on the BIP type.
     *
     * @private
     * @type {bigint}
     */
    private _dustLimit;
    /**
     * Quotes the costs of a send transaction operation.
     *
     * @param {BtcTransaction} tx - The transaction.
     * @returns {Promise<Omit<TransactionResult, 'hash'>>} The transaction's quotes.
     */
    quoteSendTransaction({ to, value, feeRate, confirmationTarget }: BtcTransaction): Promise<Omit<TransactionResult, "hash">>;
    /**
     * Returns a transaction's receipt.
     *
     * @param {string} hash - The transaction's hash.
     * @returns {Promise<BtcTransactionReceipt | null>} – The receipt, or null if the transaction has not been included in a block yet.
     */
    getTransactionReceipt(hash: string): Promise<BtcTransactionReceipt | null>;
    /**
     * Returns an estimation of the maximum spendable amount (in satoshis) that can be sent in
     * a single transaction, after subtracting estimated transaction fees.
     *
     * The estimated maximum spendable amount can differ from the wallet's total balance.
     * A transaction can only include up to MAX_UTXO_INPUTS (default: 200) unspents.
     * Wallets holding more than this limit cannot spend their full balance in a
     * single transaction. There will likely be some satoshis left over as change.
     *
     * @returns {Promise<BtcMaxSpendableResult>} The estimated maximum spendable result.
     */
    getMaxSpendable(): Promise<BtcMaxSpendableResult>;
    /**
     * Ensures the electrum client is connected.
     *
     * @protected
     * @returns {Promise<void>}
     */
    protected _ensureConnected(): Promise<void>;
    /**
     * Creates a default Electrum client based on config options.
     *
     * @private
     * @param {MempoolElectrumConfig} config - The configuration object.
     * @returns {MempoolElectrumClient} The created client.
     */
    private _createClient;
    /**
     * Computes the sha-256 hash of the output script for this wallet's address, reverses the byte order,
     * and returns it as a hex string.
     *
     * @protected
     * @returns {Promise<string>} The reversed sha-256 script hash as a hex-encoded string.
     */
    protected _getScriptHash(): Promise<string>;
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
}
export type MempoolElectrumConfig = import("./transports/index.js").MempoolElectrumConfig;
export type MempoolElectrumClient = import("./transports/index.js").MempoolElectrumClient;
export type IElectrumClient = import("./transports/index.js").IElectrumClient;
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
export type BtcWalletConfig = {
    /**
     * - Electrum client instance. If provided, host/port/protocol are ignored.
     */
    client?: IElectrumClient;
    /**
     * - The electrum server's hostname (default: "electrum.blockstream.info"). Ignored if client is provided.
     */
    host?: string;
    /**
     * - The electrum server's port (default: 50001). Ignored if client is provided.
     */
    port?: number;
    /**
     * - The transport protocol to use (default: "tcp"). Ignored if client is provided.
     */
    protocol?: "tcp" | "tls" | "ssl";
    /**
     * - The name of the network to use (default: "bitcoin").
     */
    network?: "bitcoin" | "regtest" | "testnet";
    /**
     * - The BIP address type used for key and address derivation.
     * - 44: [BIP-44 (P2PKH / legacy)](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)
     * - 84: [BIP-84 (P2WPKH / native SegWit)](https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki)
     * - Default: 84 (P2WPKH).
     */
    bip?: 44 | 84;
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
