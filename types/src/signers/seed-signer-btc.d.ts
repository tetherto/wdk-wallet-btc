/** @interface */
export class ISignerBtc {
    get index(): void;
    get path(): void;
    get keyPair(): void;
    get config(): void;
    get address(): void;
    derive(relPath: any, config?: {}): void;
    getExtendedPublicKey(): Promise<void>;
    sign(message: any): Promise<void>;
    verify(message: any, signature: any): Promise<void>;
    getWalletAddress(): Promise<void>;
    signPsbt(psbt: any): Promise<void>;
    dispose(): void;
}
/** @typedef {import('../wallet-account-read-only-btc.js').BtcWalletConfig} BtcWalletConfig */
/** @implements {ISignerBtc} */
export default class SeedSignerBtc implements ISignerBtc {
    static fromXprv(xprv: any, config?: {}): SeedSignerBtc;
    constructor(seed: any, config?: {}, opts?: {});
    _masterNode: any;
    _isActive: boolean;
    _bip: any;
    _path: string;
    _account: any;
    _address: string;
    _config: {};
    _isRoot: boolean;
    get isRoot(): boolean;
    get isActive(): boolean;
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
    get config(): {};
    get address(): string;
    derive(relPath: any, config?: {}): SeedSignerBtc;
    getExtendedPublicKey(): Promise<string>;
    getWalletAddress(): Promise<void>;
    signPsbt(psbt: any): Promise<any>;
    /**
     * Signs a message.
     *
     * @param {string} message - The message to sign.
     * @returns {Promise<string>} The message's signature.
     */
    sign(message: string): Promise<string>;
    dispose(): void;
}
export type BtcWalletConfig = import("../wallet-account-read-only-btc.js").BtcWalletConfig;
