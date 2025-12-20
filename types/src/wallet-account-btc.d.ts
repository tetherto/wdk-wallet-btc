/** @implements {IWalletAccount} */
export default class WalletAccountBtc extends WalletAccountReadOnlyBtc implements IWalletAccount {
    /**
     * Creates a new bitcoin wallet account.
     * Supports P2PKH (BIP-44), P2WPKH (BIP-84), and P2TR Taproot (BIP-86) address types.
     * Taproot addresses use Schnorr signatures (BIP-340) for transaction signing.
     *
     * @param {string | Uint8Array} seed - The wallet's [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) seed phrase.
     * @param {string} path - The derivation path suffix (e.g. "0'/0/0").
     * @param {BtcWalletConfig} [config] - The configuration object.
     */
    constructor(seed: string | Uint8Array, path: string, config?: BtcWalletConfig);
    /** @private */
    private _path;
    /** @private */
    private _bip;
    /** @private */
    private _scriptType;
    /** @private */
    private _masterNode;
    /** @private */
    private _account;
    /** @private */
    private _internalPubkey;
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
     * The script type of this account (P2TR, P2WPKH, or P2PKH).
     *
     * @type {string}
     */
    get scriptType(): string;
    /**
     * Signs a message.
     * For P2WPKH (BIP-84) and P2TR (BIP-86), uses SegWit message signing format.
     * P2TR transactions use Schnorr signatures (BIP-340), but message signing format remains compatible.
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
    /**
     * Sends a transaction.
     *
     * @param {BtcTransaction} tx - The transaction.
     * @returns {Promise<TransactionResult>} The transaction's result.
     */
    sendTransaction({ to, value, feeRate, confirmationTarget }: BtcTransaction): Promise<TransactionResult>;
    /**
     * Sends a transaction with a memo (OP_RETURN output).
     * Requires the recipient address to be a Taproot (P2TR) address.
     *
     * @param {Object} options - Transaction options.
     * @param {string} options.to - The recipient's Taproot Bitcoin address (must start with bc1p, tb1p, or bcrt1p).
     * @param {number | bigint} options.value - The amount to send (in satoshis).
     * @param {string} options.memo - The memo string to embed in OP_RETURN (max 75 bytes UTF-8).
     * @param {number | bigint} [options.feeRate] - Optional fee rate (in sats/vB). If not provided, estimated from network.
     * @param {number} [options.confirmationTarget] - Optional confirmation target in blocks (default: 1).
     * @returns {Promise<TransactionResult>} The transaction result.
     */
    sendTransactionWithMemo({ to, value, memo, feeRate, confirmationTarget }: {
        to: string;
        value: number | bigint;
        memo: string;
        feeRate?: number | bigint;
        confirmationTarget?: number;
    }): Promise<TransactionResult>;
    /**
     * Quotes a transaction with memo (OP_RETURN output) and returns the raw hexadecimal string.
     * Requires the recipient address to be a Taproot (P2TR) address.
     * Similar to quoteSendTransactionWithMemo but returns the transaction hex instead of just the fee.
     *
     * @param {Object} options - Transaction options.
     * @param {string} options.to - The recipient's Taproot Bitcoin address (must start with bc1p, tb1p, or bcrt1p).
     * @param {number | bigint} options.value - The amount to send (in satoshis).
     * @param {string} options.memo - The memo string to embed in OP_RETURN (max 75 bytes UTF-8).
     * @param {number | bigint} [options.feeRate] - Optional fee rate (in sats/vB). If not provided, estimated from network.
     * @param {number} [options.confirmationTarget] - Optional confirmation target in blocks (default: 1).
     * @returns {Promise<string>} The raw hexadecimal string of the transaction.
     */
    quoteSendTransactionWithMemoTX({ to, value, memo, feeRate, confirmationTarget }: {
        to: string;
        value: number | bigint;
        memo: string;
        feeRate?: number | bigint;
        confirmationTarget?: number;
    }): Promise<string>;
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
    /**
     * Creates an OP_RETURN script for embedding arbitrary data in a transaction.
     * Works for both P2WPKH and P2TR script types.
     *
     * @param {string} data - The data to embed (will be UTF-8 encoded).
     * @returns {Buffer} The OP_RETURN script as a Buffer.
     */
    createOpReturnScript(data: string): Buffer;
    /**
     * Builds a transaction without broadcasting it.
     * Supports additional outputs including OP_RETURN scripts.
     * Logic is isolated by script_type (P2TR vs P2WPKH).
     *
     * @param {Object} options - Transaction options.
     * @param {string} options.recipient - The recipient's Bitcoin address.
     * @param {number | bigint} options.amount - The amount to send (in satoshis).
     * @param {number | bigint} options.feeRate - The fee rate (in sats/vB).
     * @param {Array<Object>} [options.additionalOutputs] - Additional outputs to include.
     *   Each output can be:
     *   - { address: string, value: number } for regular address outputs
     *   - { script: Buffer, value: 0 } for OP_RETURN outputs
     * @returns {Promise<{txid: string, hex: string, fee: bigint, vsize: number}>} The transaction details.
     * @private
     */
    private _getTransaction;
    /**
     * Disposes the wallet account, erasing the private key from memory and closing the connection with the electrum server.
     */
    dispose(): void;
    /**
     * Builds and signs a raw transaction.
     * For P2TR (Taproot) transactions, uses Schnorr signatures (BIP-340) automatically.
     * For P2WPKH transactions, uses ECDSA signatures.
     * Supports additional outputs including OP_RETURN scripts.
     * Logic is isolated by script_type (P2TR vs P2WPKH).
     *
     * @private
     * @param {Object} options - Transaction options.
     * @param {Array} options.utxos - The UTXOs to spend.
     * @param {string} options.to - The recipient's address.
     * @param {number | bigint} options.value - The amount to send.
     * @param {number | bigint} options.fee - The transaction fee.
     * @param {number | bigint} options.feeRate - The fee rate.
     * @param {number | bigint} options.changeValue - The change amount.
     * @param {Array<Object>} [options.additionalOutputs] - Additional outputs to include.
     */
    private _getRawTransaction;
}
export type IWalletAccount = import("@tetherto/wdk-wallet").IWalletAccount;
export type KeyPair = import("@tetherto/wdk-wallet").KeyPair;
export type TransactionResult = import("@tetherto/wdk-wallet").TransactionResult;
export type TransferOptions = import("@tetherto/wdk-wallet").TransferOptions;
export type TransferResult = import("@tetherto/wdk-wallet").TransferResult;
export type BtcTransaction = import("./wallet-account-read-only-btc.js").BtcTransaction;
export type BtcWalletConfig = import("./wallet-account-read-only-btc.js").BtcWalletConfig;
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
