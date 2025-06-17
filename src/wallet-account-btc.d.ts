/**
 * Error thrown when a method or operation isn't supported
 * @extends Error
 */
export class UnsupportedOperationError extends Error {
    /**
     * @param {string} methodName  - Name of the method invoked.
     */
    constructor(methodName: string);
}
/** @implements {IWalletAccount} */
export default class WalletAccountBtc implements IWalletAccount {
    /**
     * Creates a new bitcoin wallet account.
     *
     * @param {Uint8Array} seedBuffer - Uint8Array seed buffer.
     * @param {string} path - The BIP-44 derivation path (e.g. "0'/0/0").
     * @param {BtcWalletConfig} [config] - The configuration object.
     */
    constructor(seedBuffer: Uint8Array, path: string, config?: BtcWalletConfig);
    /** @private @type {ElectrumClient} */
    private _electrumClient;
    _addrBip: string;
    _bip: any;
    /** @private @type {Uint8Array} */
    private _masterKeyAndChainCodeBuffer;
    /** @private @type {Uint8Array} */
    private _privateKeyBuffer;
    /** @private @type {Uint8Array} */
    private _chainCodeBuffer;
    /** @private @type {import('bip32').BIP32Interface} */
    private _bip32;
    get path(): string;
    get index(): number;
    get keyPair(): {
        publicKey: any;
        privateKey: Uint8Array<ArrayBufferLike>;
    };
    /**
     * @private
     * @param {string} path
     */
    private _initialize;
    _path: string;
    _address: any;
    _keyPair: {
        publicKey: any;
        privateKey: Uint8Array<ArrayBufferLike>;
    };
    getAddress(): Promise<any>;
    sign(message: any): Promise<any>;
    verify(message: any, signature: any): Promise<any>;
    /**
     * Sends a transaction.
     *
     * @param {BtcTransaction} tx - The transaction.
     * @returns {Promise<BtcTransactionResult>} The transaction's result.
     */
    sendTransaction({ to, value }: BtcTransaction): Promise<BtcTransactionResult>;
    /**
     * Quotes the costs of a send transaction operation.
     *
     * @param {BtcTransaction} tx - The transaction.
     * @returns {Promise<Omit<BtcTransactionResult, 'hash'>>} The transaction's quotes.
     */
    quoteSendTransaction({ to, value }: BtcTransaction): Promise<Omit<BtcTransactionResult, "hash">>;
    /**
     * Returns the account's bitcoin balance.
     *
     * @returns {Promise<number>} The bitcoin balance (in satoshis).
     */
    getBalance(): Promise<number>;
    getTokenBalance(tokenAddress: any): Promise<void>;
    transfer(options: any): Promise<void>;
    quoteTransfer(options: any): Promise<void>;
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
    _getTransaction({ recipient, amount }: {
        recipient: any;
        amount: any;
    }): Promise<{
        txid: any;
        hex: any;
        fee: any;
    }>;
    _getUtxos(amount: any, address: any): Promise<any[]>;
    _getRawTransaction(utxoSet: any, amount: any, recipient: any, feeRate: any): Promise<{
        txid: any;
        hex: any;
        fee: any;
    }>;
    _broadcastTransaction(txHex: any): Promise<any>;
    dispose(): void;
}
export type KeyPair = import("@wdk/wallet").KeyPair;
export type IWalletAccount = any;
export type BtcTransaction = {
    /**
     * - The transaction's recipient.
     */
    to: string;
    /**
     * - The amount of bitcoins to send to the recipient (in satoshis).
     */
    value: number;
};
export type BtcTransactionResult = {
    /**
     * - The transaction's hash.
     */
    hash: string;
    /**
     * - The gas cost (in satoshis).
     */
    fee: number;
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
     * - The value of the transfer (in bitcoin).
     */
    value: number;
    /**
     * - The direction of the transfer.
     */
    direction: "incoming" | "outgoing";
    /**
     * - The fee paid for the full transaction (in bitcoin).
     */
    fee?: number;
    /**
     * - The receiving address for outgoing transfers.
     */
    recipient?: string;
};
export type BtcWalletConfig = {
    /**
     * - The electrum server's hostname (default: "electrum.blockstream.info").
     */
    host?: string;
    /**
     * - The electrum server's port (default: 50001).
     */
    port?: number;
    /**
     * - The name of the network to use; available values: "bitcoin", "regtest", "testnet" (default: "bitcoin").
     */
    network?: string;
};
