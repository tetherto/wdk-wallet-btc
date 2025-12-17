import MempoolElectrumClient, { MempoolElectrumConfig } from './mempool-electrum-client.js';

/**
 * Electrum client using SSL sockets.
 *
 * @extends MempoolElectrumClient
 */
export default class ElectrumSsl extends MempoolElectrumClient {
    /**
     * Creates a new SSL Electrum client.
     *
     * @param {Omit<MempoolElectrumConfig, 'protocol'>} config - Configuration options.
     */
    constructor(config: Omit<MempoolElectrumConfig, 'protocol'>);
}
