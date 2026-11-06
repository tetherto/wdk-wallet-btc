/**
 * Returns the dust limit of an output: the value below which the output costs more to spend than the dust relay fee rate allows.
 *
 * Follows Bitcoin Core's `GetDustThreshold`. The size is the serialized output plus the input that would spend it, which is estimated
 * as a single-signature spend, with the witness discount applied to the unlock bytes of witness programs.
 *
 * @param {Uint8Array} script - The output's scriptPubKey.
 * @returns {bigint} The dust limit in satoshis.
 */
export function getDustLimit(script: Uint8Array): bigint;
/**
 * Returns the highest dust limit among the outputs that can be paid to an address.
 *
 * Spending a non-witness output costs the most, and P2PKH has the longest non-witness script that has an address.
 * Witness programs are at most 42 bytes long and stay below it.
 *
 * @returns {bigint} The dust limit in satoshis.
 */
export function getMaxDustLimit(): bigint;
