/**
 * The type of script an output locks to. Signers use it for address encoding and message signing only, not PSBT signing.
 * - "legacy": [P2PKH (BIP-44)](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)
 * - "segwit": [P2WPKH / native SegWit (BIP-84)](https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki)
 */
export type ScriptType = "legacy" | "segwit";
/**
 * The location of a transaction output, given by its transaction id and its index within that transaction.
 */
export type OutPoint = {
    /**
     * - The id of the transaction containing the output (64-char hex, RPC byte order).
     */
    txid: string;
    /**
     * - The output index within the transaction.
     */
    vout: number;
};
/**
 * An unspent output as the chain reports it, with its outpoint, value and confirmation height.
 */
export type ChainUtxo = {
    /**
     * - The output's location.
     */
    outpoint: OutPoint;
    /**
     * - The output value in satoshis.
     */
    value: bigint;
    /**
     * - The block height (0 if unconfirmed).
     */
    height: number;
};
/**
 * The script, address and script type of an unspent output.
 */
export type UtxoScript = {
    /**
     * - The output's scriptPubKey.
     */
    script: Uint8Array;
    /**
     * - The address the output pays to.
     */
    address: string;
    /**
     * - The type of script the output locks to.
     */
    scriptType: ScriptType;
};
/**
 * A chain UTXO together with its script, address and script type.
 */
export type Utxo = ChainUtxo & UtxoScript;
/**
 * An output created by a spend plan, with its address and value.
 */
export type SpendOutput = {
    /**
     * - The output's address.
     */
    address: string;
    /**
     * - The output value in satoshis.
     */
    value: bigint;
    /**
     * - True if the output pays back to the wallet.
     */
    isChange?: boolean;
};
/**
 * A proposed transaction: its selected inputs, the outputs it creates, and its fee, fee rate and virtual size.
 */
export type SpendPlan = {
    /**
     * - The selected unspent outputs.
     */
    inputs: Utxo[];
    /**
     * - All the transaction's outputs, in transaction order.
     */
    outputs: SpendOutput[];
    /**
     * - The fee in satoshis.
     */
    fee: bigint;
    /**
     * - The fee rate in sat/vB (may be fractional).
     */
    feeRate: number;
    /**
     * - The estimated virtual size of the transaction.
     */
    vsize: number;
};
