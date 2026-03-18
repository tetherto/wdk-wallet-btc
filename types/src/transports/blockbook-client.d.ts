/**
 * @typedef {Object} BlockbookClientConfig
 * @property {string} url - The Blockbook server base URL (e.g., 'https://btc1.trezor.io').
 */
/** @typedef {import('./btc-client.js').default} IBtcClient */
/** @typedef {import('./btc-client.js').BtcBalance} BtcBalance */
/** @typedef {import('./btc-client.js').BtcUtxo} BtcUtxo */
/** @typedef {import('./btc-client.js').BtcHistoryItem} BtcHistoryItem */
/**
 * Stateless BTC client backed by the Blockbook v2 REST API.
 *
 * @implements {IBtcClient}
 */
export default class BlockbookClient implements IBtcClient {
    /**
     * Creates a new Blockbook REST client.
     *
     * @param {BlockbookClientConfig} config - Configuration options.
     */
    constructor(config: BlockbookClientConfig);
    /**
     * @private
     * @type {string}
     */
    private _baseUrl;
    /**
     * No-op — Blockbook is a stateless REST API.
     *
     * @returns {Promise<void>}
     */
    connect(): Promise<void>;
    /**
     * No-op — Blockbook is a stateless REST API.
     *
     * @returns {Promise<void>}
     */
    close(): Promise<void>;
    /**
     * No-op — Blockbook is a stateless REST API.
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
     */
    getTransaction(txHash: string): Promise<string>;
    /**
     * Broadcasts a raw transaction to the network.
     *
     * @param {string} rawTx - The raw transaction hex.
     * @returns {Promise<string>} Transaction hash if successful.
     */
    broadcast(rawTx: string): Promise<string>;
    /**
     * Not supported by BlockbookClient.
     *
     * @param {number} _blocks - The confirmation target in blocks.
     * @returns {Promise<number>}
     */
    estimateFee(_blocks: number): Promise<number>;
    /** @private */
    private _get;
}
export type BlockbookClientConfig = {
    /**
     * - The Blockbook server base URL (e.g., 'https://btc1.trezor.io').
     */
    url: string;
};
export type IBtcClient = import("./btc-client.js").default;
export type BtcBalance = import("./btc-client.js").BtcBalance;
export type BtcUtxo = import("./btc-client.js").BtcUtxo;
export type BtcHistoryItem = import("./btc-client.js").BtcHistoryItem;
