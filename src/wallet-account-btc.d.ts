export default class WalletAccountBtc {
    static "__#2@#seedPhraseToBip32"(seedPhrase: any): any;
    /**
     * Creates a new bitcoin wallet account.
     *
     * @param {string} seedPhrase - The bip-39 mnemonic.
     * @param {string} path - The BIP-84 derivation path (e.g. "0'/0/0").
     * @param {BtcWalletConfig} [config] - The configuration object.
     */
    constructor(seedPhrase: string, path: string, config?: BtcWalletConfig);
    /**
     * The derivation path of this account (see [BIP-84](https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki)).
     *
     * @type {number}
     */
    get path(): number;
    /**
     * The derivation path's index of this account.
     *
     * @type {number}
     */
    get index(): number;
    /**
     * The account's key pair.
     *
     * @type {KeyPair}
     */
    get keyPair(): KeyPair;
    /**
     * Returns the account's address.
     *
     * @returns {Promise<string>} The account's address.
     */
    getAddress(): Promise<string>;
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
    /**
     * Sends a transaction with arbitrary data.
     *
     * @param {BtcTransaction} tx - The transaction to send.
     * @returns {Promise<string>} The transaction's hash.
     */
    sendTransaction({ to, value }: BtcTransaction): Promise<string>;
    /**
     * Quotes a transaction.
     *
     * @param {BtcTransaction} tx - The transaction to quote.
     * @returns {Promise<number>} The transaction's fee (in satoshis).
     */
    quoteTransaction({ to, value }: BtcTransaction): Promise<number>;
    /**
     * Returns the account's bitcoin balance.
     *
     * @returns {Promise<number>} The bitcoin balance (in satoshis).
     */
    getBalance(): Promise<number>;
    /**
     * Returns the balance of the account for a specific token.
     *
     * @param {string} tokenAddress - The smart contract address of the token.
     * @returns {Promise<number>} The token balance.
     */
    getTokenBalance(tokenAddress: string): Promise<number>;
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
    #private;
}
export type KeyPair = {
    /**
     * - The public key.
     */
    publicKey: string;
    /**
     * - The private key.
     */
    privateKey: string;
};
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
