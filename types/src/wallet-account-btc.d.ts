/** @implements {IWalletAccount} */
export default class WalletAccountBtc extends WalletAccountReadOnlyBtc implements IWalletAccount {
    /**
     * Creates a new bitcoin wallet account from a raw private key.
     *
     * @param {string | Uint8Array | Buffer} privateKey - The raw private key (hex string or 32 bytes).
     * @param {BtcWalletConfig} [config] - The wallet configuration options.
     * @returns {WalletAccountBtc} The wallet account.
     */
    static fromPrivateKey(privateKey: string | Uint8Array | Buffer, config?: BtcWalletConfig): WalletAccountBtc;
    /**
     * Creates a new bitcoin wallet account from a seed phrase or seed buffer.
     *
     * @param {string | Buffer} seed - The seed phrase (mnemonic) or seed buffer.
     * @param {BtcWalletConfig} [config] - The wallet configuration options (includes bip, network, etc.).
     * @param {string} [path="0'/0/0"] - The derivation path relative to the BIP root.
     * @returns {WalletAccountBtc} The wallet account.
     */
    static fromSeed(seed: string | Buffer, config?: BtcWalletConfig, path?: string): WalletAccountBtc;
    /**
     * Creates a new bitcoin wallet account.
     *
     * @param {ISignerBtc} signer - The signer.
     * @param {BtcWalletConfig} [config] - The configuration object.
     */
    constructor(signer: ISignerBtc, config?: BtcWalletConfig);
    /** @private */
    private _signer;
    /**
     * The derivation path's index of this account.
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
     * Signs a message.
     *
     * @param {string} message - The message to sign.
     * @returns {Promise<string>} The message's signature.
     */
    sign(message: string): Promise<string>;
    /**
     * Sends a transaction.
     *
     * @param {BtcTransaction} tx - The transaction.
     * @param {number} [timeoutMs] - Maximum milliseconds to poll for spent inputs to disappear from unspent outputs after broadcast.
     * @returns {Promise<TransactionResult>} The transaction's result.
     */
    sendTransaction({ to, value, feeRate, confirmationTarget }: BtcTransaction, timeoutMs?: number): Promise<TransactionResult>;
    /**
     * Transfers a token to another address.
     *
     * @param {TransferOptions} options - The transfer's options.
     * @returns {Promise<TransferResult>} The transfer's result.
     */
    transfer(options: TransferOptions): Promise<TransferResult>;
    /**
     * Returns the bitcoin transfers history of the account.
     *
     * @param {Object} [options] - The options.
     * @param {"incoming" | "outgoing" | "all"} [options.direction] - If set, only returns transfers with the given direction (default: "all").
     * @param {number} [options.limit] - The number of transfers to return (default: 10).
     * @param {number} [options.skip] - The number of transfers to skip (default: 0).
     * @returns {Promise<BtcTransfer[]>} The bitcoin transfers.
     */
    getTransfers(options?: {
        direction?: "incoming" | "outgoing" | "all";
        limit?: number;
        skip?: number;
    }): Promise<BtcTransfer[]>;
    /**
     * Returns a read-only copy of the account.
     *
     * @returns {Promise<WalletAccountReadOnlyBtc>} The read-only account.
     */
    toReadOnlyAccount(): Promise<WalletAccountReadOnlyBtc>;
    /** @private */
    private _getRawTransaction;
}
export type IWalletAccount = import("@tetherto/wdk-wallet").IWalletAccount;
export type KeyPair = import("@tetherto/wdk-wallet").KeyPair;
export type TransactionResult = import("@tetherto/wdk-wallet").TransactionResult;
export type TransferOptions = import("@tetherto/wdk-wallet").TransferOptions;
export type TransferResult = import("@tetherto/wdk-wallet").TransferResult;
export type BtcTransaction = import("./wallet-account-read-only-btc.js").BtcTransaction;
export type BtcWalletConfig = import("./wallet-account-read-only-btc.js").BtcWalletConfig;
export type ISignerBtc = import("./signers/seed-signer-btc.js").ISignerBtc;
export type BtcTransfer = {
    /**
     * - The transaction's id.
     */
    txid: string;
    /**
     * - The user's own address.
     */
    address: string;
    /**
     * - The index of the output in the transaction.
     */
    vout: number;
    /**
     * - The block height (if unconfirmed, 0).
     */
    height: number;
    /**
     * - The value of the transfer (in satoshis).
     */
    value: bigint;
    /**
     * - The direction of the transfer.
     */
    direction: "incoming" | "outgoing";
    /**
     * - The fee paid for the full transaction (in satoshis).
     */
    fee?: bigint;
    /**
     * - The receiving address for outgoing transfers.
     */
    recipient?: string;
};
import WalletAccountReadOnlyBtc from './wallet-account-read-only-btc.js';
