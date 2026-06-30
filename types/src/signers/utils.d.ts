/** @typedef {import('bitcoinjs-lib').Network} Network */
/** @typedef {import('bitcoinjs-lib').Psbt} Psbt */
/** @typedef {import('../wallet-account-read-only-btc.js').BtcWalletConfig} BtcWalletConfig */
/** @typedef {import('ecpair').ECPairInterface | import('bip32').BIP32Interface} SignerLike */
/**
 * Signs every PSBT input owned by the given leaf key, in place.
 *
 * Detects which inputs belong to `account` (by matching the derived payment script), ensures the
 * witnessUtxo is present for SegWit (BIP84) inputs, and signs each owned input directly with the leaf
 * key via {@link Psbt#signInput}. Inputs that cannot be signed (finalized, missing data) are skipped.
 * The PSBT is not finalized, to support partially signed workflows.
 *
 * @param {Psbt} psbtInstance - The PSBT instance to sign (mutated in place).
 * @param {SignerLike} account - A leaf signer exposing `publicKey` and a `sign` method (e.g. an ECPair or a BIP32 node).
 * @param {number} bip - The BIP standard (44 or 84).
 * @param {Network} network - The network configuration.
 * @returns {string} The (partially) signed PSBT in base64 format.
 */
export function signPsbtWithKey(psbtInstance: Psbt, account: SignerLike, bip: number, network: Network): string;
/**
 * Normalizes wallet configuration with defaults.
 *
 * @param {BtcWalletConfig} [config] - The configuration object.
 * @returns {BtcWalletConfig} The normalized configuration.
 * @throws {Error} If an unsupported BIP is specified.
 */
export function normalizeConfig(config?: BtcWalletConfig): BtcWalletConfig;
/**
 * Derives a Bitcoin address from a public key.
 *
 * @param {Buffer} publicKey - The public key.
 * @param {Network} network - The network configuration.
 * @param {number} [bip] - The BIP standard (44 for P2PKH, 84 for P2WPKH) (default: 44).
 * @returns {string} The Bitcoin address.
 */
export function getAddressFromPublicKey(publicKey: Buffer, network: Network, bip?: number): string;
/**
 * Signs a message.
 *
 * @param {string} message - The message to sign.
 * @param {Buffer} privateKey - The private key.
 * @param {number} bip - The BIP standard (44 or 84).
 * @returns {string} The message's signature.
 */
export function signMessage(message: string, privateKey: Buffer, bip: number): string;
export type Network = import("bitcoinjs-lib").Network;
export type Psbt = import("bitcoinjs-lib").Psbt;
export type BtcWalletConfig = import("../wallet-account-read-only-btc.js").BtcWalletConfig;
export type SignerLike = import("ecpair").ECPairInterface | import("bip32").BIP32Interface;
