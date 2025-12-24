/**
 * @typedef {Object} ElectrumClientConfig
 * @property {number} [timeout] - Connection timeout in milliseconds (default: 15_000).
 */
/**
 * @typedef {Object} ElectrumBalance
 * @property {number} confirmed - Confirmed balance in satoshis.
 * @property {number} [unconfirmed] - Unconfirmed balance in satoshis.
 */
/**
 * @typedef {Object} ElectrumUtxo
 * @property {string} tx_hash - The transaction hash containing this UTXO.
 * @property {number} tx_pos - The output index within the transaction.
 * @property {number} value - The UTXO value in satoshis.
 * @property {number} [height] - The block height (0 if unconfirmed).
 */
/**
 * @typedef {Object} ElectrumHistoryItem
 * @property {string} tx_hash - The transaction hash.
 * @property {number} height - The block height (0 or negative if unconfirmed).
 */
/** @interface */
export default class IElectrumClient {
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
export type ElectrumClientConfig = {
    /**
     * - Connection timeout in milliseconds (default: 15_000).
     */
    timeout?: number;
};
export type ElectrumBalance = {
    /**
     * - Confirmed balance in satoshis.
     */
    confirmed: number;
    /**
     * - Unconfirmed balance in satoshis.
     */
    unconfirmed?: number;
};
export type ElectrumUtxo = {
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
export type ElectrumHistoryItem = {
    /**
     * - The transaction hash.
     */
    tx_hash: string;
    /**
     * - The block height (0 or negative if unconfirmed).
     */
    height: number;
};
