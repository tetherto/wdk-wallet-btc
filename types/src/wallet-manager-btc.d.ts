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
     * Creates a new signer.
     *
     * @param {string} signerName - The signer name.
     * @param {ISignerBtc} signer - The signer.
     */
    createSigner(signerName: string, signer: ISignerBtc): void;
    /**
     * Returns the wallet account at a specific index (defaults to [BIP-84](https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki); set config.bip=44 for [BIP-44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)).
     *
     * @example
     * // Returns the account with derivation path
     * // For mainnet (bitcoin): m/84'/0'/0'/0/1
     * // For testnet or regtest: m/84'/1'/0'/0/1
     * const account = await wallet.getAccount(1);
     * @param {number} [index] - The index of the account to get (default: 0).
     * @param {string} [signerName] - The signer name (default: 'default').
     * @returns {Promise<WalletAccountBtc>} The account.
     */
    getAccount(index?: number, signerName?: string): Promise<WalletAccountBtc>;
    /**
     * Returns the wallet account at a specific derivation path.
     *
     * @example
     * // Returns the account with derivation path:
     * // For mainnet (bitcoin): m/84'/0'/0'/0/1
     * // For testnet or regtest: m/84'/1'/0'/0/1
     * const account = await wallet.getAccountByPath("0'/0/1");
     * @param {string} path - The derivation path (e.g. "0'/0/0").
     * @param {string} [signerName] - The signer name (default: 'default').
     * @returns {Promise<WalletAccountBtc>} The account.
     */
    getAccountByPath(path: string, signerName?: string): Promise<WalletAccountBtc>;
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
