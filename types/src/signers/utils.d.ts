/** @typedef {import('bitcoinjs-lib').Network} Network */
/** @typedef {import('bitcoinjs-lib').Psbt} Psbt */
/**
 * Hashes a message using SHA256.
 *
 * @param {string} message - The message to hash.
 * @returns {Buffer} The SHA256 hash of the message.
 */
export function hashMessage(message: string): Buffer;
/**
 * Builds a payment output script based on BIP standard.
 *
 * @param {number} bip - The BIP standard (44 for P2PKH, 84 for P2WPKH).
 * @param {Buffer} pubkey - The public key.
 * @param {Network} network - The network configuration.
 * @returns {Buffer} The output script.
 */
export function buildPaymentScript(bip: number, pubkey: Buffer, network: Network): Buffer;
/**
 * Detects whether a PSBT input belongs to the given script.
 *
 * @param {Psbt} psbtInstance - The PSBT instance.
 * @param {number} i - The input index.
 * @param {Buffer} myScript - The script to match against.
 * @returns {{ input: Object, prevOut: { script: Buffer, value: number } | null, isOurs: boolean }} The input data and ownership status.
 */
export function detectInputOwnership(psbtInstance: Psbt, i: number, myScript: Buffer): {
    input: any;
    prevOut: {
        script: Buffer;
        value: number;
    } | null;
    isOurs: boolean;
};
/**
 * Adds witnessUtxo to a PSBT input if needed for BIP84 signing.
 *
 * @param {Psbt} psbtInstance - The PSBT instance.
 * @param {number} i - The input index.
 * @param {number} bip - The BIP standard.
 * @param {{ script: Buffer, value: number } | null} prevOut - The previous output.
 * @param {Object} input - The input data.
 */
export function ensureWitnessUtxoIfNeeded(psbtInstance: Psbt, i: number, bip: number, prevOut: {
    script: Buffer;
    value: number;
} | null, input: any): void;
/**
 * Normalizes wallet configuration with defaults.
 *
 * @param {Object} [config] - The configuration object.
 * @param {number} [config.bip=84] - The BIP standard (44 or 84).
 * @returns {Object} The normalized configuration.
 * @throws {Error} If an unsupported BIP is specified.
 */
export function normalizeConfig(config?: {
    bip?: number;
}): any;
/**
 * Derives a Bitcoin address from a public key.
 *
 * @param {Buffer} publicKey - The public key.
 * @param {Network} network - The network configuration.
 * @param {number} [bip=44] - The BIP standard (44 for P2PKH, 84 for P2WPKH).
 * @returns {string} The Bitcoin address.
 */
export function getAddressFromPublicKey(publicKey: Buffer, network: Network, bip?: number): string;
export type Network = import("bitcoinjs-lib").Network;
export type Psbt = import("bitcoinjs-lib").Psbt;
