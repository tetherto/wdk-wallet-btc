/** @implements {IWalletAccount<string>} */
export default class WalletAccountBtc extends WalletAccountReadOnlyBtc implements IWalletAccount<string> {
    /**
     * Creates a new bitcoin wallet account from a raw private key.
     *
     * @param {string | Uint8Array} privateKey - The raw private key (hex string or 32 bytes).
     * @param {Omit<BtcWalletConfig, 'bip'> & Pick<BtcSignerConfig, 'type'>} [config] - The wallet configuration options.
     * @returns {WalletAccountBtc} The wallet account.
     * @throws {ValueError} If the private key is not 32 bytes.
     */
    static fromPrivateKey(privateKey: string | Uint8Array, config?: Omit<BtcWalletConfig, "bip"> & Pick<BtcSignerConfig, "type">): WalletAccountBtc;
    /**
     * Creates a new bitcoin wallet account from a BIP-39 seed, deriving the account's key at the
     * given derivation path.
     *
     * @param {string | Uint8Array} seed - The wallet's BIP-39 seed phrase or seed bytes.
     * @param {string} path - The derivation path relative to the BIP root (e.g. "0'/0/0").
     * @param {BtcWalletConfig} [config] - The configuration object.
     * @throws {ValueError} If the given seed phrase is invalid, or the configured bip is not supported.
     */
    constructor(seed: string | Uint8Array, path: string, config?: BtcWalletConfig);
    /**
     * Creates a new bitcoin wallet account from a BIP-39 seed, deriving the account's key at the
     * first account ("0'/0/0") of the configured network and bip.
     *
     * @param {string | Uint8Array} seed - The wallet's BIP-39 seed phrase or seed bytes.
     * @param {BtcWalletConfig} [config] - The configuration object.
     * @throws {ValueError} If the given seed phrase is invalid, or the configured bip is not supported.
     */
    constructor(seed: string | Uint8Array, config?: BtcWalletConfig);
    /**
     * Creates a new bitcoin wallet account using a signer.
     *
     * @param {ISignerBtc} signer - The signer.
     * @param {Omit<BtcWalletConfig, 'network' | 'bip'> & SignerOptions} [config] - The configuration object. The network and address type are taken from the signer.
     */
    constructor(signer: ISignerBtc, config?: Omit<BtcWalletConfig, "network" | "bip"> & SignerOptions);
    /**
     * If true, disposes the signer on calls to the 'dispose' method.
     *
     * @protected
     * @type {boolean}
     */
    protected _shouldWipeSignerOnDisposal: boolean;
    /** @private */
    private _signer;
    /**
     * Returns the account's address.
     *
     * @returns {Promise<string>} The account's address.
     */
    getAddress(): Promise<string>;
    /**
     * The derivation path of this account, or null if the account's signer is not bound to a
     * derivation position (e.g. private-key signers).
     *
     * @type {string | null}
     */
    get path(): string | null;
    /**
     * The account's key pair.
     *
     * The uint8 arrays are bound to the wallet account, so any external change will reflect to the internal representation. For this reason,
     * it's strongly recommended to treat the key pair as a read-only view of the keys. While it's still technically possible to alter their
     * content, client code should never do so.
     *
     * @type {KeyPair | null}
     */
    get keyPair(): KeyPair | null;
    /**
     * Signs a message.
     *
     * @param {string} message - The message to sign.
     * @returns {Promise<string>} The message's signature.
     */
    sign(message: string): Promise<string>;
    /**
     * Signs a transaction.
     *
     * @param {BtcTransaction} tx - The transaction to sign.
     * @returns {Promise<string>} The signed raw transaction as a hex string.
     * @throws {MaximumFeeExceededError} If the transaction's cost exceeds the maximum transaction fee option.
     * @throws {ValueError} If the amount doesn't clear the dust limit, or the spend requires more inputs than allowed.
     * @throws {TransactionError} If the account has no unspent outputs, or its balance doesn't cover the amount and its fees.
     */
    signTransaction({ to, value, feeRate, confirmationTarget }: BtcTransaction): Promise<string>;
    /**
     * Quotes the costs of a send transaction operation.
     *
     * @param {BtcTransaction | string} tx - The transaction, or a signed raw transaction as a hex string.
     * @returns {Promise<Omit<TransactionResult, 'hash'>>} The transaction's quotes.
     * @throws {ValueError} If the amount doesn't clear the dust limit, or the spend requires more inputs than allowed.
     * @throws {TransactionError} If the account has no unspent outputs, or its balance doesn't cover the amount and its fees.
     */
    quoteSendTransaction(tx: BtcTransaction | string): Promise<Omit<TransactionResult, "hash">>;
    /**
     * Sends a transaction.
     *
     * @param {BtcTransaction | string} tx - The transaction, or a signed raw transaction as a hex string.
     * @param {number} [timeoutMs] - Maximum milliseconds to poll for spent inputs to disappear from unspent outputs after broadcast.
     * @returns {Promise<TransactionResult>} The transaction's result.
     * @throws {MaximumFeeExceededError} If the transaction's cost exceeds the maximum transaction fee option.
     * @throws {ValueError} If the amount doesn't clear the dust limit, or the spend requires more inputs than allowed.
     * @throws {TransactionError} If the account has no unspent outputs, or its balance doesn't cover the amount and its fees.
     */
    sendTransaction(tx: BtcTransaction | string, timeoutMs?: number): Promise<TransactionResult>;
    /**
     * Transfers a token to another address.
     *
     * Not supported on bitcoin: the blockchain has no tokens to transfer.
     *
     * @param {TransferOptions} options - The transfer's options.
     * @returns {Promise<TransferResult>} The transfer's result.
     * @throws {UnsupportedOperationError} Always — the bitcoin blockchain doesn't support transfers.
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
    _btcReadOnlyAccount: WalletAccountReadOnlyBtc;
    /**
     * Disposes the wallet account, erasing the private key from memory and closing the connection with the server.
     * The signer given at construction is wiped only if the account owns it (see {@link SignerOptions}).
     */
    dispose(): void;
    /** @private */
    private _getSignedTransactionFee;
    /** @private */
    private _getRawTransaction;
    /** @private */
    private _buildSignedTransaction;
}
export type IWalletAccount<TSignedTransaction> = import("@tetherto/wdk-wallet").IWalletAccount<TSignedTransaction>;
export type KeyPair = import("@tetherto/wdk-wallet").KeyPair;
export type TransactionResult = import("@tetherto/wdk-wallet").TransactionResult;
export type TransferOptions = import("@tetherto/wdk-wallet").TransferOptions;
export type TransferResult = import("@tetherto/wdk-wallet").TransferResult;
export type BtcTransaction = import("./wallet-account-read-only-btc.js").BtcTransaction;
export type BtcWalletConfig = import("./wallet-account-read-only-btc.js").BtcWalletConfig;
export type ISignerBtc = import("./signers/signer-btc.js").ISignerBtc;
export type BtcSignerConfig = import("./signers/signer-btc.js").BtcSignerConfig;
export type SignerOptions = {
    /**
     * - If true, wipes the signer given at construction on calls to the 'dispose' method.
     */
    shouldWipeSignerOnDisposal?: boolean;
};
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
