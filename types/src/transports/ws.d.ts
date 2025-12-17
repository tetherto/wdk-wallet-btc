import ElectrumClient, { ElectrumBalance, ElectrumUtxo, ElectrumHistoryItem } from './electrum-client.js';

/**
 * @typedef {Object} ElectrumWsConfig
 * @property {string} url - The WebSocket URL (e.g., 'wss://electrum.example.com:50004').
 * @property {number} [timeout] - Connection timeout in milliseconds (default: 15_000).
 */
export type ElectrumWsConfig = {
    url: string;
    timeout?: number;
};

/**
 * Electrum client using WebSocket transport.
 *
 * Compatible with browser environments where TCP sockets are not available.
 * Requires an Electrum server that supports WebSocket connections.
 *
 * @extends ElectrumClient
 */
export default class ElectrumWs extends ElectrumClient {
    /**
     * Creates a new WebSocket Electrum client.
     *
     * @param {ElectrumWsConfig} config - Configuration options.
     */
    constructor(config: ElectrumWsConfig);

    /**
     * Establishes the connection to the Electrum server.
     *
     * @returns {Promise<void>}
     */
    connect(): Promise<void>;

    /**
     * Closes the underlying connection.
     *
     * @protected
     * @returns {Promise<void>}
     */
    protected _close(): Promise<void>;

    /**
     * Recreates the underlying socket and reinitializes the session.
     *
     * @returns {Promise<void>}
     */
    reconnect(): Promise<void>;

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
