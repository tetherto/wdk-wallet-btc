import MempoolElectrumClient, { MempoolElectrumConfig } from './mempool-electrum-client.js';

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
    constructor(config: Omit<MempoolElectrumConfig, 'protocol'>);
}
