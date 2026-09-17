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
 * Normalizes the signer configuration with defaults, keeping only the fields signers own.
 *
 * @internal
 * @param {BtcSignerConfig} [config] - The configuration object.
 * @returns {BtcSignerConfig} The normalized configuration.
 * @throws {ValueError} If an unsupported address type is specified.
 */
export function normalizeConfig(config?: BtcSignerConfig): BtcSignerConfig;
/**
 * Maps a wallet-level BIP purpose (44 or 84) to the equivalent signer address type.
 *
 * @internal
 * @param {44 | 84} [bip] - The BIP address type from the wallet configuration.
 * @returns {BtcAddressType | undefined} The signer address type, or undefined if no bip was given.
 * @throws {ValueError} If an unsupported BIP is specified.
 */
export function getSignerTypeForBip(bip?: 44 | 84): BtcAddressType | undefined;
/**
 * Derives a Bitcoin address from a public key.
 *
 * @internal
 * @param {Uint8Array} publicKey - The public key.
 * @param {Network} network - The network configuration.
 * @param {BtcAddressType} [type] - The address type (default: "legacy").
 * @returns {string} The Bitcoin address.
 */
export function getAddressFromPublicKey(publicKey: Uint8Array, network: Network, type?: BtcAddressType): string;
/**
 * Signs a message.
 *
 * @internal
 * @param {string} message - The message to sign.
 * @param {Uint8Array} privateKey - The private key.
 * @param {BtcAddressType} type - The address type.
 * @returns {string} The message's signature.
 */
export function signMessage(message: string, privateKey: Uint8Array, type: BtcAddressType): string;
export type Network = import("bitcoinjs-lib").Network;
export type Psbt = import("bitcoinjs-lib").Psbt;
export type BtcSignerConfig = import("./signer-btc.js").BtcSignerConfig;
export type BtcAddressType = import("./signer-btc.js").BtcAddressType;
export type ValueError = import("@tetherto/wdk-wallet").ValueError;
export type SignerLike = import("ecpair").ECPairInterface | import("bip32").BIP32Interface;
