/** @typedef {import('./seed-signer-btc.js').ISignerBtc} ISignerBtc */
/** @typedef {import('../wallet-account-read-only-btc.js').BtcWalletConfig} BtcWalletConfig */
/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('bitcoinjs-lib').Psbt} Psbt */
/** @typedef {import('@ledgerhq/device-management-kit').DeviceManagementKit} DeviceManagementKit */
/**
 * Hardware signer backed by a Ledger device.
 *
 * Uses the Ledger Device Management Kit for WebHID communication.
 * Does not expose private keys as they remain on the hardware device.
 *
 * @implements {ISignerBtc}
 */
export default class LedgerSignerBtc implements ISignerBtc {
    /**
     * Creates a new Ledger-backed signer.
     *
     * @param {string} path - The derivation path relative to BIP root (e.g., "0'/0/0").
     * @param {BtcWalletConfig} [config] - The wallet configuration.
     * @param {Object} [opts] - Internal options.
     * @param {DeviceManagementKit} [opts.dmk] - Pre-existing Device Management Kit instance.
     */
    constructor(path: string, config?: BtcWalletConfig, opts?: {
        dmk?: DeviceManagementKit;
    });
    /** @private */
    private skipOpenApp;
    /** @private */
    private _address;
    /** @private */
    private _sessionId;
    /** @private */
    private _signerBtc;
    /** @private */
    private _extendedPublicKey;
    /**
     * The wallet account configuration.
     *
     * @protected
     * @type {BtcWalletConfig}
     */
    protected _config: BtcWalletConfig;
    /** @private */
    private _path;
    /** @private */
    private _bip;
    /** @private */
    private _dmk;
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
     * The wallet configuration.
     *
     * @type {BtcWalletConfig}
     */
    get config(): BtcWalletConfig;
    /**
     * The account's Bitcoin address.
     *
     * @type {string | undefined}
     */
    get address(): string | undefined;
    /**
     * The account's key pair. Private key is always undefined for Ledger signers.
     *
     * @type {KeyPair}
     * @throws {Error} If the wallet has not been initialized yet.
     */
    get keyPair(): KeyPair;
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
     * @param {Observable<any>} observable
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
     * Returns the extended public key (xpub/zpub/tpub/vpub based on network and BIP).
     *
     * @returns {Promise<string>} The extended public key in base58 format.
     */
    getExtendedPublicKey(): Promise<string>;
    /**
     * Derives a child signer at the given relative path, reusing the current device session.
     *
     * @param {string} relPath - The relative derivation path (e.g., "0'/0/0").
     * @param {BtcWalletConfig} [cfg] - Optional configuration overrides.
     * @returns {LedgerSignerBtc} The derived child signer.
     */
    derive(relPath: string, cfg?: BtcWalletConfig): LedgerSignerBtc;
    /**
     * Returns the account's Bitcoin address, connecting to the device if needed.
     *
     * @returns {Promise<string>} The Bitcoin address.
     */
    getAddress(): Promise<string>;
    /**
     * Signs a PSBT (Partially Signed Bitcoin Transaction) using the Ledger device.
     *
     * @param {Psbt} psbt - The PSBT instance to sign.
     * @returns {Promise<Psbt>} The signed PSBT.
     */
    signPsbt(psbt: Psbt): Promise<Psbt>;
    /**
     * Signs a message.
     *
     * @param {string} message - The message to sign.
     * @returns {Promise<string>} The message's signature.
     */
    sign(message: string): Promise<string>;
    /**
     * Disposes the signer, disconnecting from the Ledger device.
     */
    dispose(): void;
}
export type ISignerBtc = import("./seed-signer-btc.js").ISignerBtc;
export type BtcWalletConfig = import("../wallet-account-read-only-btc.js").BtcWalletConfig;
export type KeyPair = import("@tetherto/wdk-wallet").KeyPair;
export type Psbt = import("bitcoinjs-lib").Psbt;
export type DeviceManagementKit = import("@ledgerhq/device-management-kit").DeviceManagementKit;
export type Observable = import("rxjs").Observable;
