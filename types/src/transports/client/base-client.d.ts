/**
 * Abstract base class for Electrum clients.
 *
 * Provides lazy initialization via a Proxy. The connection is established automatically
 * on the first RPC call.
 *
 * @abstract
 * @extends IElectrumClient
 */
export default class BaseClient extends IElectrumClient {
    /**
     * Creates a new BaseClient instance.
     *
     * @param {number} [timeout=15000] - Connection timeout in milliseconds.
     */
    constructor(timeout?: number);
    /**
     * @protected
     * @type {number}
     */
    protected _timeout: number;
    /**
     * @protected
     * @type {Promise<void> | null}
     */
    protected _ready: Promise<void> | null;
    /**
     * Ensures the electrum connection is initialized.
     *
     * @private
     * @returns {Promise<void>}
     */
    private _ensure;
    /**
     * Establishes the connection to the Electrum server.
     *
     * @protected
     * @abstract
     * @returns {Promise<void>}
     */
    protected _connect(): Promise<void>;
    /**
     * Closes the underlying connection.
     *
     * @protected
     * @abstract
     * @returns {void}
     */
    protected _close(): void;
}
import IElectrumClient from './electrum-client.js';
