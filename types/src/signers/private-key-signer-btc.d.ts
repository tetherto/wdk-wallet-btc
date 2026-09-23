/**
 * Signer backed by a single raw private key (non-HD).
 *
 * Does not support HD derivation or extended keys. Signs messages and PSBTs directly using
 * the leaf key.
 *
 * @implements {ISignerBtc}
 */
export default class PrivateKeySignerBtc implements ISignerBtc {
    /**
     * Creates a new private key signer.
     *
     * The supplied key is copied: the signer keeps its own internal copy alive until {@link dispose}
     * zeroes it, and never wipes the supplied key, whose disposal remains the caller's responsibility.
     *
     * @param {string | Uint8Array} privateKey - The raw private key (hex string or 32 bytes).
     * @param {BtcSignerConfig} [config] - The signer configuration.
     * @throws {ValueError} If the private key is not 32 bytes.
     */
    constructor(privateKey: string | Uint8Array, config?: BtcSignerConfig);
    /** @private */
    private _config;
    /** @private */
    private _account;
    /** @private */
    private _publicKey;
    /** @private */
    private _address;
    /**
     * Whether this signer can derive child signers.
     *
     * @type {false}
     */
    get isDerivable(): false;
    /**
     * The derivation path. Always null for private-key signers.
     *
     * @type {string | null}
     */
    get path(): string | null;
    /**
     * The account's Bitcoin address.
     *
     * @deprecated Use {@link getAddress} instead. This property will be removed in an upcoming
     * release: not all signers (e.g. hardware signers) can expose the address synchronously.
     * @type {string}
     */
    get address(): string;
    /**
     * The name of the network the signer's addresses are encoded for.
     *
     * @type {"bitcoin" | "regtest" | "testnet"}
     */
    get network(): "bitcoin" | "regtest" | "testnet";
    /**
     * The address type of the signer's addresses ("legacy" for P2PKH, "segwit" for P2WPKH).
     *
     * @type {BtcAddressType}
     */
    get type(): BtcAddressType;
    /**
     * The account's key pair (public and private keys).
     *
     * @type {KeyPair}
     */
    get keyPair(): KeyPair;
    /**
     * Derives a child signer using a relative path (e.g. "0'/0/0").
     *
     * @param {string} path - The relative derivation path.
     * @returns {Promise<never>} The derived signer.
     * @throws {UnsupportedOperationError} If the signer does not support account derivation.
     * @throws {ValueError} If the path is not valid.
     */
    derive(path: string): Promise<never>;
    /**
     * Returns the account's derived address.
     *
     * @returns {Promise<string>} The account's address.
     */
    getAddress(): Promise<string>;
    /**
     * Returns the extended public key (e.g. xpub/tpub).
     *
     * @returns {Promise<never>} The extended public key in base58 format.
     * @throws {UnsupportedOperationError} If the signer does not support account derivation.
     */
    getExtendedPublicKey(): Promise<never>;
    /**
     * Signs a message.
     *
     * @param {string} message - The message to sign.
     * @returns {Promise<string>} The message's signature.
     */
    sign(message: string): Promise<string>;
    /**
     * Signs a PSBT (Partially Signed Bitcoin Transaction). Caller is responsible for finalizing it; we deliver it partially signed.
     *
     * @param {Psbt | string} psbt - The PSBT instance or base64 string.
     * @returns {Promise<string>} The (partially) signed PSBT in base64 format.
     * @throws {Error} If the signer cannot sign any input of the PSBT.
     */
    signPsbt(psbt: Psbt | string): Promise<string>;
    /**
     * Disposes the signer, securely erasing its internal copy of the private key from memory.
     */
    dispose(): void;
}
export type ISignerBtc = import("./signer-btc.js").ISignerBtc;
export type BtcSignerConfig = import("./signer-btc.js").BtcSignerConfig;
export type BtcAddressType = import("./signer-btc.js").BtcAddressType;
export type KeyPair = import("@tetherto/wdk-wallet").KeyPair;
export type UnsupportedOperationError = import("@tetherto/wdk-wallet").UnsupportedOperationError;
export type ValueError = import("@tetherto/wdk-wallet").ValueError;
export type Psbt = import("bitcoinjs-lib").Psbt;
