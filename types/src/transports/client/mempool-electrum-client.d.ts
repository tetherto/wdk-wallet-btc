/**
 * @typedef {Object} MempoolElectrumConfig
 * @property {number} [timeout=15000] - Connection timeout in milliseconds.
 * @property {number} [maxRetry=2] - Maximum reconnection attempts.
 * @property {number} [retryPeriod=1000] - Delay between reconnection attempts in milliseconds.
 * @property {number} [pingPeriod=120000] - Delay between keep-alive pings in milliseconds.
 * @property {(err: Error | null) => void} [callback] - Called when all retries are exhausted.
 */
/**
 * Electrum client using @mempool/electrum-client.
 *
 * @extends BaseClient
 */
export default class MempoolClient extends BaseClient {
    /**
     * Creates a new Mempool Electrum client.
     *
     * @param {number} port - The Electrum server port.
     * @param {string} host - The Electrum server hostname.
     * @param {'tcp' | 'ssl' | 'tls'} protocol - The transport protocol.
     * @param {MempoolElectrumConfig} [config={}] - Configuration options.
     */
    constructor(port: number, host: string, protocol: "tcp" | "ssl" | "tls", config?: MempoolElectrumConfig);
    /**
     * @private
     * @type {MempoolElectrumClient}
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
    getBalance(scripthash: any): any;
    listUnspent(scripthash: any): any;
    getHistory(scripthash: any): any;
    getTransaction(txHash: any): any;
    broadcast(rawTx: any): any;
    estimateFee(blocks: any): any;
}
export type MempoolElectrumConfig = {
    /**
     * - Connection timeout in milliseconds.
     */
    timeout?: number;
    /**
     * - Maximum reconnection attempts.
     */
    maxRetry?: number;
    /**
     * - Delay between reconnection attempts in milliseconds.
     */
    retryPeriod?: number;
    /**
     * - Delay between keep-alive pings in milliseconds.
     */
    pingPeriod?: number;
    /**
     * - Called when all retries are exhausted.
     */
    callback?: (err: Error | null) => void;
};
import BaseClient from './base-client.js';
