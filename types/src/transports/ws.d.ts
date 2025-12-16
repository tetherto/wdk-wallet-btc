/**
 * Electrum client using WebSocket transport.
 *
 * Compatible with browser environments where TCP sockets are not available.
 * Requires an Electrum server that supports WebSocket connections.
 *
 * @extends ElectrumClient
 */
export default class ElectrumWs extends ElectrumClient {
    /**
     * Creates a new WebSocket Electrum client.
     *
     * @param {ElectrumWsConfig} config - Configuration options.
     */
    constructor(config: ElectrumWsConfig);
    /** @private */
    private _url;
    /** @private */
    private _ws;
    /** @private */
    private _requestId;
    /** @private */
    private _pending;
    connect(): Promise<any>;
    /** @private */
    private _handleMessage;
    /** @private */
    private _handleSingleMessage;
    /** @private */
    private _request;
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
    /**
     * - Connection timeout in milliseconds (default: 15_000).
     */
    timeout?: number;
};
import ElectrumClient from './electrum-client.js';
