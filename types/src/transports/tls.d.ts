import MempoolElectrumClient, { MempoolElectrumConfig } from './mempool-electrum-client.js';

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
    constructor(config: Omit<MempoolElectrumConfig, 'protocol'>);
}
