/** @typedef {import('./client/mempool-electrum-client.js').MempoolElectrumConfig} MempoolElectrumConfig */
/**
 * Electrum client using SSL sockets.
 *
 * @extends MempoolElectrumClient
 */
export default class ElectrumSsl extends MempoolElectrumClient {
    /**
     * Creates a new SSL Electrum client.
     *
     * @param {number} port - The Electrum server port.
     * @param {string} host - The Electrum server hostname.
     * @param {MempoolElectrumConfig} [config={}] - Configuration options.
     */
    constructor(port: number, host: string, config?: MempoolElectrumConfig);
}
export type MempoolElectrumConfig = import("./client/mempool-electrum-client.js").MempoolElectrumConfig;
import MempoolElectrumClient from './client/mempool-electrum-client.js';
