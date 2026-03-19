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
/** @typedef {import('./btc-client.js').default} IBtcClient */
/** @typedef {import('./btc-client.js').BtcBalance} BtcBalance */
/** @typedef {import('./btc-client.js').BtcUtxo} BtcUtxo */
/** @typedef {import('./btc-client.js').BtcHistoryItem} BtcHistoryItem */
/**
 * Electrum client using @mempool/electrum-client.
 *
 * @implements {IBtcClient}
 */
export default class MempoolElectrumClient implements IBtcClient {
    /**
     * Creates a new Mempool Electrum client.
     *
     * @param {MempoolElectrumConfig} config - Configuration options.
     */
    constructor(config: MempoolElectrumConfig);
    /**
     * @private
     * @type {import('bitcoinjs-lib').Network}
     */
    private _network;
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
     * Returns the balance for an address.
     *
     * @param {string} address - The bitcoin address.
     * @returns {Promise<BtcBalance>} The balance information.
     */
    getBalance(address: string): Promise<BtcBalance>;
    /**
     * Returns unspent transaction outputs for an address.
     *
     * @param {string} address - The bitcoin address.
     * @returns {Promise<BtcUtxo[]>} List of UTXOs.
     */
    listUnspent(address: string): Promise<BtcUtxo[]>;
    /**
     * Returns transaction history for an address.
     *
     * @param {string} address - The bitcoin address.
     * @returns {Promise<BtcHistoryItem[]>} List of transactions.
     */
    getHistory(address: string): Promise<BtcHistoryItem[]>;
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
     * @throws {Error} If fee estimation is unavailable.
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
     * - The network name (default: 'bitcoin').
     */
    network?: "bitcoin" | "regtest" | "testnet";
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
export type IBtcClient = import("./btc-client.js").default;
export type BtcBalance = import("./btc-client.js").BtcBalance;
export type BtcUtxo = import("./btc-client.js").BtcUtxo;
export type BtcHistoryItem = import("./btc-client.js").BtcHistoryItem;