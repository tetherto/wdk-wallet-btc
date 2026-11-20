/**
 * Builds and returns a fee-aware funding plan for sending a transaction.
 *
 * Uses descriptors + coinselect to choose inputs, at a given feeRate (sats/vB). Returns the selected
 * inputs, the outputs to create and the computed fee as a spend plan.
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
export type Utxo = import("./index.js").Utxo;
export type ChainUtxo = import("./index.js").ChainUtxo;
export type SpendPlan = import("./index.js").SpendPlan;
export type OutputInstance = import("@bitcoinerlab/descriptors").OutputInstance;
export type Network = import("bitcoinjs-lib").Network;
