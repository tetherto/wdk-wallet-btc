/** @typedef {import('../wallet-account-read-only-btc.js').BtcWalletConfig} BtcWalletConfig */
/**
 * Signer backed by a single raw private key (non-HD).
 * - Does not support HD derivation, extended keys, or master fingerprint.
 * - Signs messages and PSBTs directly using the leaf key.
 */
export default class PrivateKeySignerBtc {
    /**
     * @param {string | Uint8Array | Buffer} privateKey - Hex string or bytes of the raw private key
     * @param {BtcWalletConfig} [config] - Network/BIP configuration (bip defaults to 44, network to 'bitcoin')
     */
    constructor(privateKey: string | Uint8Array | Buffer, config?: BtcWalletConfig);
    _isActive: boolean;
    _config: {
        bip: any;
    };
    _account: import("ecpair").ECPairInterface;
    _address: string;
    _isPrivateKey: boolean;
    get isPrivateKey(): boolean;
    get isActive(): boolean;
    get index(): void;
    get path(): void;
    get keyPair(): {
        privateKey: Uint8Array<ArrayBuffer>;
        publicKey: Uint8Array<ArrayBuffer>;
    };
    get config(): {
        bip: any;
    };
    get address(): string;
    derive(): void;
    getExtendedPublicKey(): Promise<void>;
    getWalletAddress(): Promise<void>;
    /**
     * Signs a message.
     *
     * @param {string} message - The message to sign.
     * @returns {Promise<string>} The message's signature.
     */
    sign(message: string): Promise<string>;
    signPsbt(psbt: any): Promise<any>;
    dispose(): void;
}
export type BtcWalletConfig = import("../wallet-account-read-only-btc.js").BtcWalletConfig;
