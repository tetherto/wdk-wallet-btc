/**
 * Builds and returns a fee-aware funding plan for sending a transaction.
 *
 * Uses descriptors + coinselect to choose inputs, at a given feeRate (sats/vB). Returns the selected
 * inputs, the outputs to create and the computed fee as a spend plan.
 *
 * The fee and vsize are estimated by coinselect with a worst-case placeholder signature (72 bytes for ECDSA), so the real
 * signed size does not exceed the estimate for low-S signers. Same approach as Bitcoin Core's `CalculateMaximumSignedTxSize`:
 * https://github.com/bitcoin/bitcoin/blob/master/src/wallet/spend.cpp
 *
 * @param {Object} tx - The transaction.
 * @param {string} tx.fromAddress - The sender's address.
 * @param {Array<{ address: string, value: bigint }>} tx.targets - The recipients' addresses and the amounts to send (in satoshis).
 * @param {number} tx.feeRate - The fee rate (in sats/vB).
 * @param {Network} tx.network - The network.
 * @param {ChainUtxo[]} tx.chainUtxos - The sender's unspent outputs.
 * @returns {SpendPlan} - The spend plan.
 * @throws {ValueError} If there are no targets, or an amount doesn't clear the dust limit.
 * @throws {TransactionError} If the account has no unspent outputs, or its balance doesn't cover the amounts and its fees.
 */
export function planSpend({ fromAddress, targets, feeRate, network, chainUtxos }: {
    fromAddress: string;
    targets: Array<{
        address: string;
        value: bigint;
    }>;
    feeRate: number;
    network: Network;
    chainUtxos: ChainUtxo[];
}): SpendPlan;
/**
 * Builds and returns a fee-aware plan that sends all the sender's funds to a single recipient.
 *
 * Uses coinselect's maxFunds to choose inputs, at a given feeRate (sats/vB), dropping unspent outputs
 * worth less than their own input fee. Returns the selected inputs, the output to create and the
 * computed fee as a spend plan.
 *
 * The fee and vsize are estimated by coinselect with a worst-case placeholder signature (72 bytes for ECDSA), so the real
 * signed size does not exceed the estimate for low-S signers. Same approach as Bitcoin Core's `CalculateMaximumSignedTxSize`:
 * https://github.com/bitcoin/bitcoin/blob/master/src/wallet/spend.cpp
 *
 * @param {Object} tx - The transaction.
 * @param {string} tx.fromAddress - The sender's address.
 * @param {string} tx.toAddress - The recipient's address.
 * @param {number} tx.feeRate - The fee rate (in sats/vB).
 * @param {Network} tx.network - The network.
 * @param {ChainUtxo[]} tx.chainUtxos - The sender's unspent outputs.
 * @returns {SpendPlan} - The spend plan.
 * @throws {ValueError} If the transaction exceeds the maximum standard size.
 * @throws {TransactionError} If the account has no unspent outputs, or its funds after the fee don't clear the recipient's dust limit.
 */
export function planSweep({ fromAddress, toAddress, feeRate, network, chainUtxos }: {
    fromAddress: string;
    toAddress: string;
    feeRate: number;
    network: Network;
    chainUtxos: ChainUtxo[];
}): SpendPlan;
/**
 * Builds an unsigned PSBT from a spend plan, after verifying its inputs against their
 * previous transactions. Inputs and change outputs carry their key origin when one is given.
 *
 * @param {Object} param
 * @param {SpendPlan} param.plan
 * @param {Network} param.network - The network.
 * @param {{ [txId: string]: string }} param.prevTxs
 * @param {{ [address: string]: KeyOrigin }} [param.keyOrigins] - The key origins by address, attached to the inputs and the change outputs paying those addresses.
 * @throws {AssertionError} If the plan's inputs minus its outputs don't add up to its fee.
 */
export function buildPsbt(params: {
    plan: SpendPlan;
    network: Network;
    prevTxs: {
        [txId: string]: string;
    };
    keyOrigins?: {
        [address: string]: KeyOrigin;
    };
}): Psbt;
/**
 * Verifies each input's real previous output — fetched from the
 * blockchain — matches what spend planning assumed, rather than trusting the client's
 * `listSpendable` report as-is.
 *
 * @param {Utxo[]} utxos - The selected unspent outputs.
 * @param {{ [txId: string]: string }} prevTxs - The raw hex of the previous transactions, by txid.
 * @throws {ValueError} If a previous transaction is missing.
 * @throws {AssertionError} If a previous transaction's id, script, or value doesn't match what was reported.
 */
export function verifyUtxos(utxos: Utxo[], prevTxs: {
    [txId: string]: string;
}): void;
/**
 * Computes the fee of a signed transaction from the previous transactions it spends.
 *
 * @param {Transaction} transaction - The decoded signed transaction.
 * @param {{ [txId: string]: string }} prevTxs - The raw hex of the previous transactions, by txid.
 * @returns {bigint} The fee (in satoshis).
 * @throws {ValueError} If a previous transaction is missing.
 * @throws {AssertionError} If a previous transaction's id doesn't match the input that spends it.
 */
export function getSignedTransactionFee(transaction: Transaction, prevTxs: {
    [txId: string]: string;
}): bigint;
export type Utxo = import("./index.js").Utxo;
export type ChainUtxo = import("./index.js").ChainUtxo;
export type SpendPlan = import("./index.js").SpendPlan;
export type KeyOrigin = import("./index.js").KeyOrigin;
export type OutputInstance = import("@bitcoinerlab/descriptors").OutputInstance;
export type Network = import("bitcoinjs-lib").Network;
export type Psbt = import("bitcoinjs-lib").Psbt;
export type Transaction = import("bitcoinjs-lib").Transaction;
