/** @typedef {import('../wallet-account-read-only-btc.js').BtcWalletConfig} BtcWalletConfig */
/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('./seed-signer-btc.js').ISignerBtc} ISignerBtc */
/**
 * Signer backed by a single raw private key (non-HD).
 *
 * Does not support HD derivation, extended keys, or master fingerprint.
 * Signs messages and PSBTs directly using the leaf key.
 *
 * @implements {ISignerBtc}
 */
export default class PrivateKeySignerBtc implements ISignerBtc {
    /**
     * Creates a new private key signer.
     *
     * @param {string | Uint8Array | Buffer} privateKey - The raw private key (hex string or 32 bytes).
     * @param {BtcWalletConfig} [config] - The wallet configuration.
     */
    constructor(privateKey: string | Uint8Array | Buffer, config?: BtcWalletConfig);
    /**
     * @private
     * @type {BtcWalletConfig}
     */
    private _config: BtcWalletConfig;
    /** @private */
    private _account;
    /** @private */
    private _address;
    /**
     * Whether this signer can derive child signers. Always false: a private-key signer is a single
     * standalone account bound directly to a wallet account.
     *
     * @type {boolean}
     */
    get isDerivable(): boolean;
    /**
     * The account index. Always undefined for private-key signers: a raw key has no BIP-44 position.
     *
     * @type {number | undefined}
     */
    get index(): number | undefined;
    /**
     * The derivation path. Always undefined for private-key signers.
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
     * The account's Bitcoin address.
     *
     * @type {string}
     */
    get address(): string;
    /**
     * Not supported for private key signers.
     *
     * @returns {Promise<never>}
     * @throws {SignerError} Always — private-key signers do not support derivation.
     */
    derive(): Promise<never>;
    /**
     * Not available for private key signers.
     *
     * @throws {Error} Always throws since extended keys require HD derivation.
     */
    getExtendedPublicKey(): Promise<void>;
    /**
     * Signs a message.
     *
     * @param {string} message - The message to sign.
     * @returns {Promise<string>} The message's signature.
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
     * Disposes the signer, securely erasing the private key from memory.
     */
    dispose(): void;
}
export type BtcWalletConfig = import("../wallet-account-read-only-btc.js").BtcWalletConfig;
export type KeyPair = import("@tetherto/wdk-wallet").KeyPair;
export type ISignerBtc = import("./seed-signer-btc.js").ISignerBtc;
import { Psbt } from 'bitcoinjs-lib';
