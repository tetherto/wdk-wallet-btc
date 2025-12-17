/**
 * @typedef {Object} ElectrumClientConfig
 * @property {number} [timeout] - Connection timeout in milliseconds (default: 15_000).
 */
export type ElectrumClientConfig = {
    timeout?: number;
};

/**
 * @typedef {Object} ElectrumBalance
 * @property {number} confirmed - Confirmed balance in satoshis.
 * @property {number} [unconfirmed] - Unconfirmed balance in satoshis.
 */
export type ElectrumBalance = {
    confirmed: number;
    unconfirmed?: number;
};

/**
 * @typedef {Object} ElectrumUtxo
 * @property {string} tx_hash - The transaction hash containing this UTXO.
 * @property {number} tx_pos - The output index within the transaction.
 * @property {number} value - The UTXO value in satoshis.
 * @property {number} [height] - The block height (0 if unconfirmed).
 */
export type ElectrumUtxo = {
    tx_hash: string;
    tx_pos: number;
    value: number;
    height?: number;
};

/**
 * @typedef {Object} ElectrumHistoryItem
 * @property {string} tx_hash - The transaction hash.
 * @property {number} height - The block height (0 or negative if unconfirmed).
 */
export type ElectrumHistoryItem = {
    tx_hash: string;
    height: number;
};

/** @interface */
export class IElectrumClient {
    /**
     * Closes the connection.
     *
     * @returns {Promise<void>}
     */
    close(): Promise<void>;

    /**
     * Recreates the underlying socket and reinitializes the session.
     *
     * @returns {Promise<void>}
     */
    reconnect(): Promise<void>;

    /**
     * Establishes the connection to the Electrum server.
     *
     * @returns {Promise<void>}
     */
    connect(): Promise<void>;

    /**
     * Returns the balance for a script hash.
     *
     * @param {string} scripthash - The script hash.
     * @returns {Promise<ElectrumBalance>} The balance information.
     * @see https://electrum.readthedocs.io/en/latest/protocol.html#blockchain-address-get-balance
     */
    getBalance(scripthash: string): Promise<ElectrumBalance>;

    /**
     * Returns unspent transaction outputs for a script hash.
     *
     * @param {string} scripthash - The script hash.
     * @returns {Promise<ElectrumUtxo[]>} List of UTXOs.
     * @see https://electrum.readthedocs.io/en/latest/protocol.html#blockchain-address-listunspent
     */
    listUnspent(scripthash: string): Promise<ElectrumUtxo[]>;

    /**
     * Returns transaction history for a script hash.
     *
     * @param {string} scripthash - The script hash.
     * @returns {Promise<ElectrumHistoryItem[]>} List of transactions.
     * @see https://electrum.readthedocs.io/en/latest/protocol.html#blockchain-address-get-history
     */
    getHistory(scripthash: string): Promise<ElectrumHistoryItem[]>;

    /**
     * Returns a raw transaction.
     *
     * @param {string} txHash - The transaction hash.
     * @returns {Promise<string>} Hex-encoded raw transaction.
     * @see https://electrum.readthedocs.io/en/latest/protocol.html#blockchain-transaction-get
     */
    getTransaction(txHash: string): Promise<string>;

    /**
     * Broadcasts a raw transaction to the network.
     *
     * @param {string} rawTx - The raw transaction hex.
     * @returns {Promise<string>} Transaction hash if successful.
     * @see https://electrum.readthedocs.io/en/latest/protocol.html#blockchain-transaction-broadcast
     */
    broadcast(rawTx: string): Promise<string>;

    /**
     * Returns the estimated fee rate.
     *
     * @param {number} blocks - The confirmation target in blocks.
     * @returns {Promise<number>} Fee rate in BTC/kB.
     * @see https://electrum.readthedocs.io/en/latest/protocol.html#blockchain-estimatefee
     */
    estimateFee(blocks: number): Promise<number>;
}

/**
 * Abstract base class for Electrum clients.
 *
 * Provides lazy initialization via a Proxy. The connection is established automatically
 * on the first RPC call.
 *
 * @abstract
 * @implements {IElectrumClient}
 */
export default class ElectrumClient implements IElectrumClient {
    /**
     * Creates a new ElectrumClient instance.
     *
     * @param {ElectrumClientConfig} [config] - Configuration options.
     */
    constructor(config?: ElectrumClientConfig);

    /**
     * Connection timeout in milliseconds.
     *
     * @protected
     * @type {number}
     */
    protected _timeout: number;

    /**
     * Promise that resolves when the connection is established, or null if not yet initiated.
     *
     * @protected
     * @type {Promise<void> | null}
     */
    protected _ready: Promise<void> | null;

    /**
     * Closes the underlying connection.
     *
     * @protected
     * @abstract
     * @returns {Promise<void>}
     */
    protected _close(): Promise<void>;

    /**
     * Closes the connection.
     *
     * @returns {Promise<void>}
     */
    close(): Promise<void>;

    /**
     * Recreates the underlying socket and reinitializes the session.
     *
     * @abstract
     * @returns {Promise<void>}
     */
    reconnect(): Promise<void>;

    /**
     * Establishes the connection to the Electrum server.
     *
     * @abstract
     * @returns {Promise<void>}
     */
    connect(): Promise<void>;

    /**
     * Returns the balance for a script hash.
     *
     * @abstract
     * @param {string} scripthash - The script hash.
     * @returns {Promise<ElectrumBalance>} The balance information.
     * @see https://electrum.readthedocs.io/en/latest/protocol.html#blockchain-address-get-balance
     */
    getBalance(scripthash: string): Promise<ElectrumBalance>;

    /**
     * Returns unspent transaction outputs for a script hash.
     *
     * @abstract
     * @param {string} scripthash - The script hash.
     * @returns {Promise<ElectrumUtxo[]>} List of UTXOs.
     * @see https://electrum.readthedocs.io/en/latest/protocol.html#blockchain-address-listunspent
     */
    listUnspent(scripthash: string): Promise<ElectrumUtxo[]>;

    /**
     * Returns transaction history for a script hash.
     *
     * @abstract
     * @param {string} scripthash - The script hash.
     * @returns {Promise<ElectrumHistoryItem[]>} List of transactions.
     * @see https://electrum.readthedocs.io/en/latest/protocol.html#blockchain-address-get-history
     */
    getHistory(scripthash: string): Promise<ElectrumHistoryItem[]>;

    /**
     * Returns a raw transaction.
     *
     * @abstract
     * @param {string} txHash - The transaction hash.
     * @returns {Promise<string>} Hex-encoded raw transaction.
     * @see https://electrum.readthedocs.io/en/latest/protocol.html#blockchain-transaction-get
     */
    getTransaction(txHash: string): Promise<string>;

    /**
     * Broadcasts a raw transaction to the network.
     *
     * @abstract
     * @param {string} rawTx - The raw transaction hex.
     * @returns {Promise<string>} Transaction hash if successful.
     * @see https://electrum.readthedocs.io/en/latest/protocol.html#blockchain-transaction-broadcast
     */
    broadcast(rawTx: string): Promise<string>;

    /**
     * Returns the estimated fee rate.
     *
     * @abstract
     * @param {number} blocks - The confirmation target in blocks.
     * @returns {Promise<number>} Fee rate in BTC/kB.
     * @see https://electrum.readthedocs.io/en/latest/protocol.html#blockchain-estimatefee
     */
    estimateFee(blocks: number): Promise<number>;
}
