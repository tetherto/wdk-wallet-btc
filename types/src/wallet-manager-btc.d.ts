export default class WalletManagerBtc extends WalletManager {
    /**
     * Creates a new wallet manager for the bitcoin blockchain.
     *
     * Accepts either a BIP-39 seed (string mnemonic or raw Uint8Array) for
     * backwards compatibility, or an {@link ISignerBtc} instance for the new
     * signer-based workflow.
     *
     * @param {string | Uint8Array | ISignerBtc} seedOrSigner - A BIP-39 seed phrase, raw seed bytes, or a root signer.
     * @param {BtcWalletConfig} [config] - The configuration object.
     */
    constructor(seedOrSigner: string | Uint8Array | ISignerBtc, config?: BtcWalletConfig);
    /**
     * A list of all the bitcoin client options.
     *
     * @protected
     * @type {Array<IBtcClient>}
     */
    protected _clientList: Array<IBtcClient>;
    /**
     * A client to interact with the bitcoin network.
     *
     * @protected
     * @type {IBtcClient}
     */
    protected _client: IBtcClient;
    /**
     * A list that maps each client to a flag that is true only if the client was externally provided.
     *
     * @protected
     * @type {Array<boolean>}
     */
    get _isExternalClient(): Array<boolean>;
    /**
     * Returns the wallet account at a specific index, or the account associated with a registered
     * signer name (defaults to [BIP-84](https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki);
     * set config.bip=44 for [BIP-44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)).
     *
     * @param {number} [index] - The index of the account to get (default: 0).
     * @param {Object} [options] - Account options.
     * @param {string} [options.signerName] - The signer name. Omit to use the default signer.
     * @returns {Promise<WalletAccountBtc>} The account.
     *
     * @example
     * // Returns the account with derivation path
     * // For mainnet (bitcoin): m/84'/0'/0'/0/1
     * // For testnet or regtest: m/84'/1'/0'/0/1
     * const account = await wallet.getAccount(1);
     */
    getAccount(index?: number, options?: {
        signerName?: string;
    }): Promise<WalletAccountBtc>;
    getAccount(signerName: string): Promise<WalletAccountBtc>;
    /**
     * Returns the wallet account at a specific derivation path.
     *
     * @example
     * // Returns the account with derivation path:
     * // For mainnet (bitcoin): m/84'/0'/0'/0/1
     * // For testnet or regtest: m/84'/1'/0'/0/1
     * const account = await wallet.getAccountByPath("0'/0/1");
     * @param {string} path - The derivation path (e.g. "0'/0/0").
     * @param {Object} [options] - Account options.
     * @param {string} [options.signerName] - The signer name. Omit to use the default signer.
     * @returns {Promise<WalletAccountBtc>} The account.
     * @throws {Error} If a signer name is given but no signer exists with that name.
     * @throws {SignerError} If the signer doesn't support account derivation.
     */
    getAccountByPath(path: string, options?: {
        signerName?: string;
    }): Promise<WalletAccountBtc>;
    /**
     * Returns the relative ("0'/0/0") portion of a signer's full derivation path, or the default
     * account path when the signer has no path of its own (e.g. a seed root).
     *
     * @private
     * @param {ISignerBtc} signer - The signer.
     * @returns {string} The relative derivation path.
     */
    private _relativePath;
    /**
     * Returns the current fee rates.
     *
     * @returns {Promise<FeeRates>} The fee rates (in satoshis).
     */
    getFeeRates(): Promise<FeeRates>;
    /**
     * Disposes all the wallet accounts, erasing their private keys from the memory and closing all internal connections.
     */
    dispose(): void;
}
export type FeeRates = import("@tetherto/wdk-wallet").FeeRates;
export type BtcWalletConfig = import("./wallet-account-btc.js").BtcWalletConfig;
export type ISignerBtc = import("./signers/seed-signer-btc.js").ISignerBtc;
export type IBtcClient = import("./transports/index.js").IBtcClient;
import WalletManager from '@tetherto/wdk-wallet';
import WalletAccountBtc from './wallet-account-btc.js';
