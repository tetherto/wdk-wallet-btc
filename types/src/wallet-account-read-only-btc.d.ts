export default class WalletAccountReadOnlyBtc extends WalletAccountReadOnly {
    /**
     * Creates a new bitcoin read-only wallet account.
     *
     * @param {string} address - The account's address.
     * @param {BtcWalletConfig} [config] - The configuration object.
     */
    constructor(address: string, config?: BtcWalletConfig);
    /**
     * The wallet account configuration.
     *
     * @protected
     * @type {BtcWalletConfig}
     */
    protected _config: BtcWalletConfig;
    /**
     * Electrum client to interact with a bitcoin node.
     *
     * @protected
     * @type {ElectrumClient}
     */
    protected _electrumClient: ElectrumClient;
    /**
     * Quotes the costs of a transfer operation.
     *
     * @param {TransferOptions} options - The transfer's options.
     * @returns {Promise<Omit<TransferResult, 'hash'>>} The transfer's quotes.
     */
    quoteTransfer(options: TransferOptions): Promise<Omit<TransferResult, "hash">>;
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
     * Estimates the fee for a transaction (supports P2PKH and P2WPKH).
     *
     * @protected
     * @param {{ fromAddress: string, to: string, value: number }} params
     * @returns {Promise<number>}
     */
    protected _estimateFee({ fromAddress, to, value }: {
        fromAddress: string;
        to: string;
        value: number;
    }): Promise<number>;
    /** @private */
    private _encodeVarInt;
    /** @private */
    private _serializeWitness;
    /** @private */
    private _isSegWitOutput;
    /** @private */
    private _getAddressFromScript;
}
export type TransactionResult = import("@wdk/wallet").TransactionResult;
export type TransferOptions = import("@wdk/wallet").TransferOptions;
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
     * - The BIP address type. Available values: 44 or 84 (default: 44).
     */
    bip?: 44 | 84;
    /**
     * The name of the network to use (default: "bitcoin").
     */
    network?: "bitcoin" | "regtest" | "testnet";
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
    value: number;
    /**
     * - The direction of the transfer.
     */
    direction: "incoming" | "outgoing";
    /**
     * - The fee paid for the full transaction (in satoshis).
     */
    fee?: number;
    /**
     * - The receiving address for outgoing transfers.
     */
    recipient?: string;
};
import { WalletAccountReadOnly } from '@wdk/wallet';
import ElectrumClient from './electrum-client.js';
