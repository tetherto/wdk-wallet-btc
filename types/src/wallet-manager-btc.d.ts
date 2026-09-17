/** @extends {WalletManager<ISignerBtc>} */
export default class WalletManagerBtc extends WalletManager<ISignerBtc> {
    /**
     * Creates a new wallet manager for the bitcoin blockchain from a BIP-39 seed.
     *
     * @param {string | Uint8Array} seed - The BIP-39 seed phrase or raw seed bytes.
     * @param {BtcWalletConfig} [config] - The configuration object.
     * @throws {ValueError} If the seed phrase is invalid.
     */
    constructor(seed: string | Uint8Array, config?: BtcWalletConfig);
    /**
     * Creates a new wallet manager for the bitcoin blockchain from a default signer.
     *
     * The default signer must be derivable (it must be able to derive child accounts);
     * non-derivable signers (e.g. private-key signers) are not allowed as the default but
     * may be registered by name via {@link addSigner}.
     * **Warning:** the signer is kept exactly as given, not cloned. Disposing it directly breaks
     * further account derivation, and the manager never disposes a signer you supplied.
     *
     * @param {ISignerBtc} signer - The default signer.
     * @param {BtcWalletConfig} [config] - The configuration object.
     * @throws {InvalidSignerError} If the default signer does not support account derivation.
     */
    constructor(signer: ISignerBtc, config?: BtcWalletConfig);
    /**
     * If true, disposes the default signer on calls to the 'dispose' method.
     *
     * @protected
     * @type {boolean}
     */
    protected _shouldWipeDefaultSignerOnDisposal: boolean;
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
     * Returns the wallet account at a specific index.
     *
     * **Warning:** derivation is relative to the signer's own path. If the signer sits at a leaf
     * (e.g. m/84'/0'/0'/0/0), getAccount(1) derives m/84'/0'/0'/0/0/0'/0/1 — probably not what
     * you want; use a signer at the purpose/coin-type root (e.g. m/84'/0').
     *
     * @param {number} [index] - The index of the account to get (default: 0).
     * @param {Object} [options] - Account options.
     * @param {string} [options.signerName] - The signer name. Omit to use the default signer.
     * @returns {Promise<WalletAccountBtc>} The account.
     * @throws {NoSuchElementError} If a signer name is given but no signer exists with that name.
     * @throws {UnsupportedOperationError} If the signer doesn't support account derivation.
     * @example
     * // Returns the account with derivation path
     * // For mainnet (bitcoin): m/84'/0'/0'/0/1
     * // For testnet or regtest: m/84'/1'/0'/0/1
     * const account = await wallet.getAccount(1);
     */
    getAccount(index?: number, options?: {
        signerName?: string;
    }): Promise<WalletAccountBtc>;
    /**
     * Returns the wallet account associated with a registered signer.
     *
     * **Warning:** the returned account wraps the registered signer itself, exactly where it
     * sits - e.g. a second seed registered at the intermediate path "m/84'/0'" yields the
     * account AT "m/84'/0'", not at a derived leaf, which is rarely what you want to transact
     * with. Disposing the returned account leaves the registered signer untouched.
     *
     * @param {string} signerName - The signer name registered via {@link addSigner}.
     * @returns {Promise<WalletAccountBtc>} The account.
     * @throws {NoSuchElementError} If no signer exists with the given name.
     */
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
     * @throws {NoSuchElementError} If a signer name is given but no signer exists with that name.
     * @throws {UnsupportedOperationError} If the signer doesn't support account derivation.
     */
    getAccountByPath(path: string, options?: {
        signerName?: string;
    }): Promise<WalletAccountBtc>;
    /**
     * Returns the current fee rates.
     *
     * @returns {Promise<FeeRates>} The fee rates (in satoshis).
     */
    getFeeRates(): Promise<FeeRates>;
    /**
     * A list that maps each client to a flag that is true only if the client was externally provided.
     *
     * @protected
     * @type {Array<boolean>}
     */
    protected get _isExternalClient(): Array<boolean>;
    /**
     * Disposes all the wallet accounts, erasing their private keys from the memory and closing all internal connections.
     */
    dispose(): void;
}
export type FeeRates = import("@tetherto/wdk-wallet").FeeRates;
export type NoSuchElementError = import("@tetherto/wdk-wallet").NoSuchElementError;
export type ValueError = import("@tetherto/wdk-wallet").ValueError;
export type InvalidSignerError = import("@tetherto/wdk-wallet").InvalidSignerError;
export type UnsupportedOperationError = import("@tetherto/wdk-wallet").UnsupportedOperationError;
export type BtcWalletConfig = import("./wallet-account-btc.js").BtcWalletConfig;
export type ISignerBtc = import("./signers/signer-btc.js").ISignerBtc;
export type IBtcClient = import("./transports/index.js").IBtcClient;
import WalletManager from '@tetherto/wdk-wallet';
import WalletAccountBtc from './wallet-account-btc.js';
