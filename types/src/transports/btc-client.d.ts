/**
 * @typedef {Object} BtcClientConfig
 * @property {number} [timeout] - Connection timeout in milliseconds (default: 15_000).
 */
/**
 * @typedef {Object} BtcBalance
 * @property {number} confirmed - Confirmed balance in satoshis.
 * @property {number} [unconfirmed] - Unconfirmed balance in satoshis.
 */
/**
 * @typedef {Object} BtcUtxo
 * @property {string} tx_hash - The transaction hash containing this UTXO.
 * @property {number} tx_pos - The output index within the transaction.
 * @property {number} value - The UTXO value in satoshis.
 * @property {number} [height] - The block height (0 if unconfirmed).
 */
/**
 * @typedef {Object} BtcHistoryItem
 * @property {string} tx_hash - The transaction hash.
 * @property {number} height - The block height (0 or negative if unconfirmed).
 */
/** @interface */
export default interface IBtcClient {
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
     * Establishes the connection to the server.
     *
     * @returns {Promise<void>}
     */
    connect(): Promise<void>;
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
     * @returns {Promise<number>} Fee rate in BTC/kB, or -1 if estimation is unavailable.
     * @see https://electrumx.readthedocs.io/en/latest/protocol-methods.html#blockchain-estimatefee
     */
    estimateFee(blocks: number): Promise<number>;
}
export type BtcClientConfig = {
    /**
     * - Connection timeout in milliseconds (default: 15_000).
     */
    timeout?: number;
};
export type BtcBalance = {
    /**
     * - Confirmed balance in satoshis.
     */
    confirmed: number;
    /**
     * - Unconfirmed balance in satoshis.
     */
    unconfirmed?: number;
};
export type BtcUtxo = {
    /**
     * - The transaction hash containing this UTXO.
     */
    tx_hash: string;
    /**
     * - The output index within the transaction.
     */
    tx_pos: number;
    /**
     * - The UTXO value in satoshis.
     */
    value: number;
    /**
     * - The block height (0 if unconfirmed).
     */
    height?: number;
};
export type BtcHistoryItem = {
    /**
     * - The transaction hash.
     */
    tx_hash: string;
    /**
     * - The block height (0 or negative if unconfirmed).
     */
    height: number;
};
