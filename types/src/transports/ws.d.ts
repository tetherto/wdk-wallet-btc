/**
 * Electrum client using WebSocket transport.
 *
 * Compatible with browser environments where TCP sockets are not available.
 * Requires an Electrum server that supports WebSocket connections.
 *
 * @implements {IElectrumClient}
 */
export default class ElectrumWs implements IElectrumClient {
    /**
     * Creates a new WebSocket Electrum client.
     *
     * @param {ElectrumWsConfig} config - Configuration options.
     */
    constructor(config: ElectrumWsConfig);
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
    connect(): Promise<void>;
    /** @private */
    private _handleMessage;
    /** @private */
    private _handleSingleMessage;
    /** @private */
    private _request;
    close(): Promise<void>;
    reconnect(): Promise<void>;
    getBalance(scripthash: any): Promise<any>;
    listUnspent(scripthash: any): Promise<any>;
    getHistory(scripthash: any): Promise<any>;
    getTransaction(txHash: any): Promise<any>;
    broadcast(rawTx: any): Promise<any>;
    estimateFee(blocks: any): Promise<any>;
}
export type ElectrumWsConfig = {
    /**
     * - The WebSocket URL (e.g., 'wss://electrum.example.com:50004').
     */
    url: string;
};
export type IElectrumClient = import("./electrum-client.js").default;
