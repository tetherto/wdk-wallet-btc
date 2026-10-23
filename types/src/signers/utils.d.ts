/**
 * Signs every PSBT input the given leaf key controls, in place.
 *
 * Input matching, previous-output validation and sighash computation are delegated entirely to
 * {@link Psbt#signAllInputs}: any input whose script the key controls gets a partial signature,
 * regardless of its script type. The PSBT is not finalized, to support partially signed
 * workflows (e.g. multisig).
 *
 * @internal
 * @param {Psbt} psbtInstance - The PSBT instance to sign (mutated in place).
 * @param {SignerLike} account - A leaf signer exposing `publicKey` and a `sign` method (e.g. an ECPair or a BIP32 node).
 * @returns {string} The (partially) signed PSBT in base64 format.
 * @throws {Error} If the signer cannot sign any input of the PSBT.
 */
export function signPsbtWithKey(psbtInstance: Psbt, account: SignerLike): string;
/**
 * Maps a wallet-level BIP purpose (44 or 84) to the equivalent signer address type.
 *
 * @internal
 * @param {44 | 84} [bip] - The BIP address type from the wallet configuration.
 * @returns {ScriptType | undefined} The signer address type, or undefined if no bip was given.
 * @throws {ValueError} If an unsupported BIP is specified.
 */
export function getSignerTypeForBip(bip?: 44 | 84): ScriptType | undefined;
/**
 * Derives a Bitcoin address from a public key.
 *
 * @internal
 * @param {Uint8Array} publicKey - The public key.
 * @param {Network} network - The network configuration.
 * @param {ScriptType} type - The address type.
 * @returns {string} The Bitcoin address.
 */
export function getAddressFromPublicKey(publicKey: Uint8Array, network: Network, type: ScriptType): string;
/**
 * Signs a message.
 *
 * @internal
 * @param {string} message - The message to sign.
 * @param {Uint8Array} privateKey - The private key.
 * @param {ScriptType} type - The address type.
 * @returns {string} The message's signature.
 */
export function signMessage(message: string, privateKey: Uint8Array, type: ScriptType): string;
/**
 * The address type signers use when the configuration does not specify one.
 *
 * @internal
 * @type {ScriptType}
 */
export const DEFAULT_ADDRESS_TYPE: ScriptType;
export type Network = import("bitcoinjs-lib").Network;
export type Psbt = import("bitcoinjs-lib").Psbt;
export type BtcSignerConfig = import("./signer-btc.js").BtcSignerConfig;
export type ScriptType = import("../primitives/index.js").ScriptType;
export type ValueError = import("@tetherto/wdk-wallet").ValueError;
export type SignerLike = import("ecpair").ECPairInterface | import("bip32").BIP32Interface;
