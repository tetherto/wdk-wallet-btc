/**
 * @typedef {Object} MempoolElectrumConfig
 * @property {string} host - The Electrum server hostname.
 * @property {number} port - The Electrum server port.
 * @property {'tcp' | 'ssl' | 'tls'} [protocol] - The transport protocol (default: 'tcp').
 * @property {number} [timeout] - Connection timeout in milliseconds (default: 15000).
 * @property {number} [maxRetry] - Maximum reconnection attempts (default: 2).
 * @property {number} [retryPeriod] - Delay between reconnection attempts in milliseconds (default: 1000).
 * @property {number} [pingPeriod] - Delay between keep-alive pings in milliseconds (default: 120000).
 * @property {(err: Error | null) => void} [callback] - Called when all retries are exhausted.
 */
/**
 * Electrum client using @mempool/electrum-client.
 *
 * @extends ElectrumClient
 */
export default class MempoolElectrumClient extends ElectrumClient {
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
    getBalance(scripthash: any): Promise<any>;
    listUnspent(scripthash: any): Promise<any>;
    getHistory(scripthash: any): Promise<any>;
    getTransaction(txHash: any): Promise<any>;
    broadcast(rawTx: any): Promise<any>;
    estimateFee(blocks: any): Promise<any>;
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
     * - Connection timeout in milliseconds (default: 15000).
     */
    timeout?: number;
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
import ElectrumClient from './electrum-client.js';
