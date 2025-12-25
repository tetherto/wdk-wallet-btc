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
    connect(): Promise<void>;
    close(): Promise<void>;
    reconnect(): Promise<void>;
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
