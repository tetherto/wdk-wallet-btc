/** @typedef {import('./mempool-electrum-client.js').MempoolElectrumConfig} MempoolElectrumConfig */
/**
 * Electrum client using TLS sockets.
 *
 * @extends MempoolElectrumClient
 */
export default class ElectrumTls extends MempoolElectrumClient {
    /**
     * Creates a new TLS Electrum client.
     *
     * @param {Omit<MempoolElectrumConfig, 'protocol'>} config - Configuration options.
     */
    constructor(config: Omit<MempoolElectrumConfig, "protocol">);
}
export type MempoolElectrumConfig = import("./mempool-electrum-client.js").MempoolElectrumConfig;
import MempoolElectrumClient from './mempool-electrum-client.js';
