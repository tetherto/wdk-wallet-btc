/**
 * @typedef {import('./abstract-wallet-manager.js').FeeRates}             FeeRates
 * @typedef {import('./wallet-account-btc.js').default}                  WalletAccountBtc
 * @typedef {import('./wallet-account-btc.js').BtcWalletConfig}         BtcWalletConfig
 */
export default class WalletManagerBtc {
    /**
     * Creates a new wallet manager for the bitcoin blockchain.
     *
     * @param {string | Uint8Array} seed - The wallet's [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) seed phrase.
     * @param {number}  bip - The address type, default to 44
     * @param {BtcWalletConfig} [config] - The configuration object.
     */
    constructor(seed: string | Uint8Array, config?: BtcWalletConfig);
    /**
     * @private
     * @type {Map<string, WalletAccountBtc>}
     */
    private _accounts;
    getAccount(index?: number): Promise<WalletAccountBtc>;
    getAccountByPath(path: any): Promise<WalletAccountBtc>;
    /**
     * Returns the current fee rates.
     *
     * @returns {Promise<FeeRates>} The fee rates (in satoshis).
     */
    getFeeRates(): Promise<FeeRates>;
    dispose(): void;
    _seed: any;
    _config: any;
}
export type FeeRates = any;
export type WalletAccountBtc = import("./wallet-account-btc.js").default;
export type BtcWalletConfig = import("./wallet-account-btc.js").BtcWalletConfig;
import WalletAccountBtc from './wallet-account-btc.js';
