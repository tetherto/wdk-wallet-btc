/**
 * @implements {ISignerBtc}
 */
export default class LedgerSignerBtc implements ISignerBtc {
    constructor(path: any, config?: {}, opts?: {});
    /**
     * Device/session state (lazy initialization like EVM signer)
     */
    _address: string;
    _sessionId: string;
    _signerBtc: import("@ledgerhq/device-signer-kit-bitcoin/internal/DefaultSignerBtc.js").DefaultSignerBtc;
    _isActive: boolean;
    /**
     * The wallet account configuration.
     *
     * @protected
     * @type {BtcWalletConfig}
     */
    protected _config: BtcWalletConfig;
    _path: string;
    _bip: any;
    /**
     * @type {import('@ledgerhq/device-management-kit').DeviceManagementKit}
     */
    _dmk: import("@ledgerhq/device-management-kit").DeviceManagementKit;
    get isActive(): boolean;
    get index(): number;
    /**
     * The derivation path of this account.
     *
     * @type {string}
     */
    get path(): string;
    get config(): BtcWalletConfig;
    get address(): string;
    /**
     * Disconnect current session if any.
     * @private
     */
    private _disconnect;
    /**
     * Reconnect device and refresh signer/address
     *
     * @private
     */
    private _reconnect;
    /**
     * Ensure the device is in a usable state before sending actions.
     * - If locked or busy: fail fast with a friendly error.
     * - If not connected: attempt reconnect.
     *
     * @param {string} _context
     * @private
     */
    private _ensureDeviceReady;
    /**
     * Consume a DeviceAction observable and resolve on Completed; reject early on Error/Stopped.
     *
     * @template T
     * @param {import('rxjs').Observable<any>} observable
     * @returns {Promise<T>}
     * @private
     */
    private _consumeDeviceAction;
    /**
     * Discover and connect the device, then hydrate signer/account/address.
     *
     * @private
     */
    private _connect;
    /**
     * Derive a new signer at the given relative path, reusing the current device session.
     *
     * @param {string} relPath - Relative BIP-44 path (e.g. "0'/0/1").
     * @param {import('../wallet-account-btc.js').BtcWalletConfig} [cfg]
     * @returns {LedgerSignerBtc}
     */
    derive(relPath: string, cfg?: import("../wallet-account-btc.js").BtcWalletConfig): LedgerSignerBtc;
    /** @returns {Promise<string>} */
    getAddress(): Promise<string>;
    signPsbt(psbt: any): Promise<any>;
    /**
     * Signs a message.
     *
     * @param {string} message - The message to sign.
     * @returns {Promise<string>} The message's signature.
     */
    sign(message: string): Promise<string>;
    /**
     * Verifies a message's signature.
     *
     * @param {string} message - The original message.
     * @param {string} signature - The signature to verify.
     * @returns {Promise<boolean>} True if the signature is valid.
     */
    verify(message: string, signature: string): Promise<boolean>;
    dispose(): void;
}
export type ISignerBtc = import("./seed-signer-btc.js").ISignerBtc;
