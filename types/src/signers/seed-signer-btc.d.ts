/**
 * Interface for Bitcoin signers.
 * @implements {ISigner}
 * @interface
 */
export class ISignerBtc implements ISigner {
    /**
     * The derivation path index of this account.
     *
     * @type {number}
     */
    get index(): number;
    /**
     * The full derivation path of this account.
     *
     * @type {string}
     */
    get path(): string;
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
     * The account's Bitcoin address.
     *
     * @type {string}
     */
    get address(): string;
    /**
     * Derives a child signer from the current signer.
     *
     * @param {string} relPath - The relative derivation path.
     * @param {BtcWalletConfig} [config] - Optional configuration overrides.
     * @returns {ISignerBtc} The derived child signer.
     */
    derive(relPath: string, config?: BtcWalletConfig): ISignerBtc;
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
     * Verifies a message signature.
     *
     * @param {string} message - The original message.
     * @param {string} signature - The signature to verify.
     * @returns {Promise<boolean>} True if the signature is valid.
     */
    verify(message: string, signature: string): Promise<boolean>;
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
 * @implements {ISignerBtc}
 */
export default class SeedSignerBtc implements ISignerBtc {
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
     * @param {import('bip32').BIP32Interface} [opts.masterNode] - Pre-derived master node.
     * @param {string} [opts.path] - Derivation path relative to BIP root.
     */
    constructor(seed: string | Buffer, config?: BtcWalletConfig, opts?: {
        masterNode?: import("bip32").BIP32Interface;
        path?: string;
    });
    _masterNode: import("bip32").BIP32Interface;
    _isActive: boolean;
    _bip: 84 | 44;
    _path: string;
    _account: import("bip32").BIP32Interface;
    _address: string;
    _config: import("../wallet-account-read-only-btc.js").BtcWalletConfig;
    _isRoot: boolean;
    /**
     * Whether this is the root (underived) signer.
     *
     * @type {boolean}
     */
    get isRoot(): boolean;
    /**
     * Whether the signer is still active (not disposed).
     *
     * @type {boolean}
     */
    get isActive(): boolean;
    /**
     * The derivation path index of this account.
     *
     * @type {number}
     */
    get index(): number;
    /**
     * The derivation path of this account.
     *
     * @type {string}
     */
    get path(): string;
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
     * Derives a child signer from the current signer.
     *
     * @param {string} relPath - The relative derivation path (e.g., "0'/0/0").
     * @param {BtcWalletConfig} [config] - Optional configuration overrides.
     * @returns {SeedSignerBtc} The derived child signer.
     */
    derive(relPath: string, config?: BtcWalletConfig): SeedSignerBtc;
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
export type ISigner = any;
export type BtcWalletConfig = import("../wallet-account-read-only-btc.js").BtcWalletConfig;
export type KeyPair = import("@tetherto/wdk-wallet").KeyPair;
import { Psbt } from 'bitcoinjs-lib';
