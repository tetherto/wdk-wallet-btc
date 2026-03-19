/**
 * @typedef {Object} ElectrumWsConfig
 * @property {string} url - The WebSocket URL (e.g., 'wss://electrum.example.com:50004').
 */
/** @typedef {import('./btc-client.js').default} IBtcClient */
/** @typedef {import('./btc-client.js').BtcBalance} BtcBalance */
/** @typedef {import('./btc-client.js').BtcUtxo} BtcUtxo */
/** @typedef {import('./btc-client.js').BtcHistoryItem} BtcHistoryItem */
/**
 * Electrum client using WebSocket transport.
 *
 * Compatible with browser environments where TCP sockets are not available.
 * Requires an Electrum server that supports WebSocket connections.
 *
 * @implements {IBtcClient}
 */
export default class ElectrumWs implements IBtcClient {
    /**
     * Creates a new WebSocket Electrum client.
     *
     * @param {ElectrumWsConfig} config - Configuration options.
     */
    constructor(config: ElectrumWsConfig);
    /**
     * @private
     * @type {import('bitcoinjs-lib').Network}
     */
    private _network;
    /**
     * @private
     * @type {string}
     */
    private _url;
    /**
     * @private
     * @type {WebSocket | null}
     */
    private _ws;
    /**
     * @private
     * @type {number}
     */
    private _requestId;
    /**
     * @private
     * @type {Map<number, { resolve: (value: any) => void, reject: (reason: Error) => void }>}
     */
    private _pending;
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
    /** @private */
    private _handleMessage;
    /** @private */
    private _handleSingleMessage;
    /** @private */
    private _request;
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
export type ElectrumWsConfig = {
    /**
     * - The WebSocket URL (e.g., 'wss://electrum.example.com:50004').
     */
    url: string;
    /**
     * - The network name (default: 'bitcoin').
     */
    network?: "bitcoin" | "regtest" | "testnet";
};
export type IBtcClient = import("./btc-client.js").default;
export type BtcBalance = import("./btc-client.js").BtcBalance;
export type BtcUtxo = import("./btc-client.js").BtcUtxo;
export type BtcHistoryItem = import("./btc-client.js").BtcHistoryItem;