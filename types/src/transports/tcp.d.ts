/** @typedef {import('./mempool-electrum-client.js').MempoolElectrumConfig} MempoolElectrumConfig */
/**
 * Electrum client using TCP sockets.
 *
 * @extends MempoolElectrumClient
 */
export default class ElectrumTcp extends MempoolElectrumClient {
    /**
     * Creates a new TCP Electrum client.
     *
     * @param {Omit<MempoolElectrumConfig, 'protocol'>} config - Configuration options.
     */
    constructor(config: Omit<MempoolElectrumConfig, "protocol">);
}
export type MempoolElectrumConfig = import("./mempool-electrum-client.js").MempoolElectrumConfig;
import MempoolElectrumClient from './mempool-electrum-client.js';
