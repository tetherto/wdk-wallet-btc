/**
 * @typedef {Object} BtcWalletConfig
 * @property {string} [host] - The electrum server's hostname (default: "electrum.blockstream.info").
 * @property {number} [port] - The electrum server's port (default: 50001).
 * @property {string} [network] - The name of the network to use; available values: "bitcoin", "regtest", "testnet" (default: "bitcoin").
 */
export default class WalletManagerBtc {
    /**
     * Returns a random [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) seed phrase.
     *
     * @returns {string} The seed phrase.
     */
    static getRandomSeedPhrase(): string;
    /**
     * Checks if a seed phrase is valid.
     *
     * @param {string} seedPhrase - The seed phrase.
     * @returns {boolean} True if the seed phrase is valid.
     */
    static isValidSeedPhrase(seedPhrase: string): boolean;
    /**
     * Creates a new wallet manager for the bitcoin blockchain.
     *
     * @param {string} seedPhrase - The wallet's [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) seed phrase.
     * @param {BtcWalletConfig} [config] - The configuration object.
     */
    constructor(seedPhrase: string, config?: BtcWalletConfig);
    /**
     * The seed phrase of the wallet.
     *
     * @type {string}
     */
    get seedPhrase(): string;
    /**
     * Returns the wallet account at a specific index (see [BIP-84](https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki)).
     *
     * @example
     * // Returns the account with derivation path m/84'/0'/0'/0/1
     * const account = await wallet.getAccount(1);
     * @param {number} [index] - The index of the account to get (default: 0).
     * @returns {Promise<WalletAccountBtc>} The account.
    */
    getAccount(index?: number): Promise<WalletAccountBtc>;
    /**
     * Returns the wallet account at a specific BIP-84 derivation path.
     *
     * @example
     * // Returns the account with derivation path m/84'/0'/0'/0/1
     * const account = await wallet.getAccountByPath("0'/0/1");
     * @param {string} path - The derivation path (e.g. "0'/0/0").
     * @returns {Promise<WalletAccountBtc>} The account.
     */
    getAccountByPath(path: string): Promise<WalletAccountBtc>;
    /**
     * Returns the current fee rates.
     *
     * @returns {Promise<{ normal: number, fast: number }>} The fee rates (in satoshis).
     */
    getFeeRates(): Promise<{
        normal: number;
        fast: number;
    }>;
    #private;
}
export type BtcWalletConfig = {
    /**
     * - The electrum server's hostname (default: "electrum.blockstream.info").
     */
    host?: string;
    /**
     * - The electrum server's port (default: 50001).
     */
    port?: number;
    /**
     * - The name of the network to use; available values: "bitcoin", "regtest", "testnet" (default: "bitcoin").
     */
    network?: string;
};
import WalletAccountBtc from './wallet-account-btc.js';
