/**
 * Interface for Electrum clients.
 *
 * @abstract
 */
export default class IElectrumClient {
    /**
     * Closes the connection.
     *
     * @abstract
     * @returns {void}
     */
    close(): void;
    /**
     * Recreates the underlying socket and reinitializes the session.
     *
     * @abstract
     * @returns {Promise<void>}
     */
    reconnect(): Promise<void>;
    /**
     * Returns the balance for a script hash.
     *
     * @abstract
     * @param {string} scripthash - The script hash.
     * @returns {Promise<{ confirmed: number }>} Confirmed balance in satoshis.
     */
    getBalance(scripthash: string): Promise<{
        confirmed: number;
    }>;
    /**
     * Returns unspent transaction outputs for a script hash.
     *
     * @abstract
     * @param {string} scripthash - The script hash.
     * @returns {Promise<Array<{ tx_hash: string, tx_pos: number, value: number }>>} List of UTXOs.
     */
    listUnspent(scripthash: string): Promise<Array<{
        tx_hash: string;
        tx_pos: number;
        value: number;
    }>>;
    /**
     * Returns transaction history for a script hash.
     *
     * @abstract
     * @param {string} scripthash - The script hash.
     * @returns {Promise<Array<{ tx_hash: string, height: number }>>} List of transactions.
     */
    getHistory(scripthash: string): Promise<Array<{
        tx_hash: string;
        height: number;
    }>>;
    /**
     * Returns a raw transaction.
     *
     * @abstract
     * @param {string} txHash - The transaction hash.
     * @returns {Promise<string>} Hex-encoded raw transaction.
     */
    getTransaction(txHash: string): Promise<string>;
    /**
     * Broadcasts a raw transaction to the network.
     *
     * @abstract
     * @param {string} rawTx - The raw transaction hex.
     * @returns {Promise<string>} Transaction hash if successful.
     */
    broadcast(rawTx: string): Promise<string>;
    /**
     * Returns the estimated fee rate.
     *
     * @abstract
     * @param {number} blocks - The confirmation target in blocks.
     * @returns {Promise<number>} Fee rate in BTC/kB.
     */
    estimateFee(blocks: number): Promise<number>;
}
