/**
 * Interface for Bitcoin signers, extending the base {@link ISigner} from `@tetherto/wdk-wallet`
 * @extends {ISigner}
 * @interface
 */
export class ISignerBtc extends ISigner {
    /**
     * Whether this signer can derive child signers.
     *
     * @type {boolean}
     */
    get isDerivable(): boolean;
    /**
     * The derivation path index of this account, when applicable.
     *
     * @type {number | undefined}
     */
    get index(): number | undefined;
    /**
     * The full derivation path of this account, when applicable.
     *
     * @type {string | undefined}
     */
    get path(): string | undefined;
    /**
     * The account's key pair (public and private keys).
     *
     * @type {KeyPair}
     */
    get keyPair(): KeyPair;
    /**
     * The wallet configuration.
     *
     * @type {BtcWalletConfig}
     */
    get config(): BtcWalletConfig;
    /**
     * The account's Bitcoin address, when available.
     *
     * @type {string | undefined}
     */
    get address(): string | undefined;
    /**
     * Derives a child signer from the current signer, using the same configuration.
     *
     * @param {string} relPath - The relative derivation path.
     * @returns {Promise<ISignerBtc>} The derived child signer.
     * @throws {SignerError} If the signer does not support derivation.
     */
    derive(relPath: string): Promise<ISignerBtc>;
    /**
     * Returns the extended public key (xpub/zpub).
     *
     * @returns {Promise<string>} The extended public key.
     */
    getExtendedPublicKey(): Promise<string>;
    /**
     * Signs a message.
     *
     * @param {string} message - The message to sign.
     * @returns {Promise<string>} The signature in base64 format.
     */
    sign(message: string): Promise<string>;
    /**
     * Signs a PSBT (Partially Signed Bitcoin Transaction).
     *
     * @param {Psbt | string} psbt - The PSBT instance or base64 string.
     * @returns {Promise<string>} The signed PSBT in base64 format.
     */
    signPsbt(psbt: Psbt | string): Promise<string>;
    /**
     * Disposes the signer, securely erasing sensitive data from memory.
     */
    dispose(): void;
}
/**
 * HD signer backed by a BIP39 seed phrase or seed buffer.
 *
 * @extends {ISignerBtc}
 */
export default class SeedSignerBtc extends ISignerBtc {
    /**
     * Creates a signer from an extended private key (xprv/tprv).
     *
     * @param {string} xprv - The extended private key in base58 format.
     * @param {BtcWalletConfig} [config] - The wallet configuration.
     * @returns {SeedSignerBtc} The signer instance.
     */
    static fromXprv(xprv: string, config?: BtcWalletConfig): SeedSignerBtc;
    /**
     * Creates a new seed-based signer.
     *
     * @param {string | Buffer} seed - The seed phrase (mnemonic) or seed buffer.
     * @param {BtcWalletConfig} [config] - The wallet configuration.
     * @param {Object} [opts] - Internal options.
     * @param {BIP32Interface} [opts.masterNode] - Pre-derived master node (e.g. from an extended private key).
     * @param {string} [opts.path] - Relative derivation path of the account (default: "0'/0/0").
     * @param {boolean} [opts.isChild] - When true, the signer is a derived child and does not retain the
     *   master node, so it cannot derive further.
     */
    constructor(seed: string | Buffer, config?: BtcWalletConfig, opts?: {
        masterNode?: import("bip32").BIP32Interface;
        path?: string;
        isChild?: boolean;
    });
    /**
     * @protected
     * @type {BtcWalletConfig}
     */
    protected _config: BtcWalletConfig;
    /** @private */
    private _bip;
    /** @private */
    private _masterNode;
    /** @private */
    private _account;
    /** @private */
    private _path;
    /** @private */
    private _address;
    /**
     * Whether this signer can derive child signers.
     *
     * @type {boolean}
     */
    get isDerivable(): boolean;
    /**
     * The derivation path index of this account.
     *
     * @type {number | undefined}
     */
    get index(): number | undefined;
    /**
     * The derivation path of this account.
     *
     * @type {string | undefined}
     */
    get path(): string | undefined;
    /**
     * The account's key pair.
     *
     * @type {KeyPair}
     */
    get keyPair(): KeyPair;
    /**
     * The wallet configuration.
     *
     * @type {BtcWalletConfig}
     */
    get config(): BtcWalletConfig;
    /**
     * The account's Bitcoin address.
     *
     * @type {string}
     */
    get address(): string;
    /**
     * Derives a detached child signer from the current root signer.
     *
     * @param {string} relPath - The relative derivation path (e.g., "0'/0/0").
     * @returns {Promise<SeedSignerBtc>} The derived child signer.
     * @throws {SignerError} If this signer has no master node (it is a derived child or has been disposed).
     */
    derive(relPath: string): Promise<SeedSignerBtc>;
    /**
     * Returns the extended public key (xpub/zpub/tpub/vpub based on network and BIP).
     *
     * @returns {Promise<string>} The extended public key in base58 format.
     */
    getExtendedPublicKey(): Promise<string>;
    /**
     * Signs a PSBT (Partially Signed Bitcoin Transaction).
     *
     * @param {Psbt | string} psbt - The PSBT instance or base64 string.
     * @returns {Promise<string>} The signed PSBT in base64 format.
     */
    signPsbt(psbt: Psbt | string): Promise<string>;
    /**
     * Signs a message.
     *
     * @param {string} message - The message to sign.
     * @returns {Promise<string>} The message's signature.
     */
    sign(message: string): Promise<string>;
    /**
     * Disposes the signer, securely erasing private keys from memory.
     */
    dispose(): void;
}
export type BtcWalletConfig = import("../wallet-account-read-only-btc.js").BtcWalletConfig;
export type KeyPair = import("@tetherto/wdk-wallet").KeyPair;
export type BIP32Interface = import("bip32").BIP32Interface;
import { ISigner } from '@tetherto/wdk-wallet';
import { Psbt } from 'bitcoinjs-lib';
