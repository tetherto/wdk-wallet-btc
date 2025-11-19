/**
 * @typedef {Object} ElectrumConfig
 * @property {string} [client] - The name of the client reported to the server (default: 'wdk-wallet').
 * @property {string} [version] - The electrum protocol version (default: '1.4').
 */
/**
 * @typedef {Object} PersistencePolicy
 * @property {number} [maxRetry] - The maximum reconnection attempts before failing (default: 2).
 * @property {number} [retryPeriod] - The delay between reconnect attempts, in ms (default: 1_000).
 * @property {number} [pingPeriod] - The delay between keep-alive pings, in ms (default: 120_000).
 * @property {(err: Error | null) => void} [callback] - An optional status callback.
 */
/**
 * A thin wrapper around {@link @mempool/electrum-client} that lazily initializes the underlying
 * electrum connection on first rpc call.
 *
 * The instance returned from the constructor is a proxy that intercepts all method calls
 * except `close`, `initElectrum`, and `reconnect` and ensures the client is initialized.
 */
export default class ElectrumClient {
    /**
     * Create a new electrum client wrapper.
     *
     * @param {number} port - The electrum server's port.
     * @param {string} host - The electrum server's hostname.
     * @param {'tcp' | 'tls' | 'ssl'} protocol - The transport protocol to use.
     * @param {PersistencePolicy} [persistencePolicy] - The persistence policy.
     */
    constructor(port: number, host: string, protocol: "tcp" | "tls" | "ssl", persistencePolicy?: PersistencePolicy);
    /**
     * @private
     * @type {ElectrumConfig}
     **/
    private _electrumConfig;
    /**
     * @private
     * @type {PersistencePolicy}
     **/
    private _persistencePolicy;
    /**
     * @private
     * @type {Promise<void> | null}
     */
    private _ready;
    /**
     * Ensures the electrum connection is initialized. If a previous attempt failed or the
     * client was closed, a new initialization is attempted.
     *
     * @private
     * @param {number} [timeout] - The timeout, in ms (default: 15_000).
     * @returns {Promise<void>}
     */
    private _ensure;
    /**
     * Recreates the underlying socket and reinitializes the session.
     *
     * @returns {Promise<void>}
     */
    reconnect(): Promise<void>;
    /**
     * Closes the connection.
     *
     * @returns {void}
     */
    close(): void;
}
export type ElectrumConfig = {
    /**
     * - The name of the client reported to the server (default: 'wdk-wallet').
     */
    client?: string;
    /**
     * - The electrum protocol version (default: '1.4').
     */
    version?: string;
};
export type PersistencePolicy = {
    /**
     * - The maximum reconnection attempts before failing (default: 2).
     */
    maxRetry?: number;
    /**
     * - The delay between reconnect attempts, in ms (default: 1_000).
     */
    retryPeriod?: number;
    /**
     * - The delay between keep-alive pings, in ms (default: 120_000).
     */
    pingPeriod?: number;
    /**
     * - An optional status callback.
     */
    callback?: (err: Error | null) => void;
};
