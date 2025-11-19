export default class WalletManagerBtc extends WalletManager {
    /**
     * Creates a new wallet manager for the bitcoin blockchain.
     *
     * @param {string | Uint8Array} seed - The wallet's [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) seed phrase.
     * @param {BtcWalletConfig} [config] - The configuration object.
     */
    constructor(seed: string | Uint8Array, config?: BtcWalletConfig);
    /**
     * Returns the wallet account at a specific index (defaults to [BIP-84](https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki); set config.bip=44 for [BIP-44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)).
     *
     * @example
     * // Returns the account with derivation path
     * // For mainnet (bitcoin): m/84'/0'/0'/0/1
     * // For testnet or regtest: m/84'/1'/0'/0/1
     * const account = await wallet.getAccount(1);
     * @param {number} [index] - The index of the account to get (default: 0).
     * @returns {Promise<WalletAccountBtc>} The account.
     */
    getAccount(index?: number): Promise<WalletAccountBtc>;
    /**
     * Returns the wallet account at a specific derivation path.
     *
     * @example
     * // Returns the account with derivation path:
     * // For mainnet (bitcoin): m/84'/0'/0'/0/1
     * // For testnet or regtest: m/84'/1'/0'/0/1
     * const account = await wallet.getAccountByPath("0'/0/1");
     * @param {string} path - The derivation path (e.g. "0'/0/0").
     * @returns {Promise<WalletAccountBtc>} The account.
     */
    getAccountByPath(path: string): Promise<WalletAccountBtc>;
}
export type FeeRates = import("@tetherto/wdk-wallet").FeeRates;
export type BtcWalletConfig = import("./wallet-account-btc.js").BtcWalletConfig;
import WalletManager from '@tetherto/wdk-wallet';
import WalletAccountBtc from './wallet-account-btc.js';
