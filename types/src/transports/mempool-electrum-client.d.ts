/**
 * @typedef {Object} MempoolElectrumConfig
 * @property {string} host - The Electrum server hostname.
 * @property {number} port - The Electrum server port.
 * @property {'tcp' | 'ssl' | 'tls'} [protocol] - The transport protocol (default: 'tcp').
 * @property {number} [maxRetry] - Maximum reconnection attempts (default: 2).
 * @property {number} [retryPeriod] - Delay between reconnection attempts in milliseconds (default: 1000).
 * @property {number} [pingPeriod] - Delay between keep-alive pings in milliseconds (default: 120000).
 * @property {(err: Error | null) => void} [callback] - Called when all retries are exhausted.
 */
/** @typedef {import('./electrum-client.js').default} IElectrumClient */
/** @typedef {import('./electrum-client.js').ElectrumBalance} ElectrumBalance */
/** @typedef {import('./electrum-client.js').ElectrumUtxo} ElectrumUtxo */
/** @typedef {import('./electrum-client.js').ElectrumHistoryItem} ElectrumHistoryItem */
/**
 * Electrum client using @mempool/electrum-client.
 *
 * @implements {IElectrumClient}
 */
export default class MempoolElectrumClient implements IElectrumClient {
    /**
     * Creates a new Mempool Electrum client.
     *
     * @param {MempoolElectrumConfig} config - Configuration options.
     */
    constructor(config: MempoolElectrumConfig);
    /**
     * @private
     * @type {MempoolClient}
     */
    private _client;
    /**
     * @private
     * @type {{ client: string, version: string }}
     */
    private _electrumConfig;
    /**
     * @private
     * @type {{ maxRetry: number, retryPeriod: number, pingPeriod: number, callback: ((err: Error | null) => void) | null }}
     */
    private _persistencePolicy;
    /**
     * @private
     * @type {boolean}
     */
    private _connected;
    /**
     * @private
     * @type {Promise<void> | null}
     */
    private _connecting;
    /**
     * Establishes the connection to the Electrum server.
     *
     * @returns {Promise<void>}
     */
    connect(): Promise<void>;
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
export type MempoolElectrumConfig = {
    /**
     * - The Electrum server hostname.
     */
    host: string;
    /**
     * - The Electrum server port.
     */
    port: number;
    /**
     * - The transport protocol (default: 'tcp').
     */
    protocol?: "tcp" | "ssl" | "tls";
    /**
     * - Maximum reconnection attempts (default: 2).
     */
    maxRetry?: number;
    /**
     * - Delay between reconnection attempts in milliseconds (default: 1000).
     */
    retryPeriod?: number;
    /**
     * - Delay between keep-alive pings in milliseconds (default: 120000).
     */
    pingPeriod?: number;
    /**
     * - Called when all retries are exhausted.
     */
    callback?: (err: Error | null) => void;
};
export type IElectrumClient = import("./electrum-client.js").default;
export type ElectrumBalance = import("./electrum-client.js").ElectrumBalance;
export type ElectrumUtxo = import("./electrum-client.js").ElectrumUtxo;
export type ElectrumHistoryItem = import("./electrum-client.js").ElectrumHistoryItem;
