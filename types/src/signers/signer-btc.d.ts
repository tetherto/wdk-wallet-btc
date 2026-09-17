/**
 * Interface for Bitcoin signers, extending the base `ISigner` from `@tetherto/wdk-wallet`.
 *
 * @interface
 */
export class ISignerBtc extends ISigner {
    /**
     * The account's address, if available.
     *
     * @deprecated Use {@link getAddress} instead. This property will be removed in an upcoming
     * release: not all signers (e.g. hardware signers) can expose the address synchronously.
     * @type {string | undefined}
     */
    get address(): string | undefined;
    /**
     * The name of the network the signer's addresses are encoded for.
     *
     * @type {"bitcoin" | "regtest" | "testnet"}
     */
    get network(): "bitcoin" | "regtest" | "testnet";
    /**
     * The address type of the signer's addresses ("legacy" for P2PKH, "segwit" for P2WPKH).
     *
     * @type {BtcAddressType}
     */
    get type(): BtcAddressType;
    /**
     * Returns the extended public key (e.g. xpub/tpub).
     *
     * @returns {Promise<string>} The extended public key in base58 format.
     * @throws {UnsupportedOperationError} If the signer does not support extended keys.
     */
    getExtendedPublicKey(): Promise<string>;
    /**
     * Signs a PSBT (Partially Signed Bitcoin Transaction). Caller is responsible for finalizing it; we deliver it partially signed.
     *
     * @param {Psbt | string} psbt - The PSBT instance or base64 string.
     * @returns {Promise<string>} The (partially) signed PSBT in base64 format.
     * @throws {Error} If the signer cannot sign any input of the PSBT.
     */
    signPsbt(psbt: Psbt | string): Promise<string>;
}
/**
 * The signer's address type. Governs address encoding and message signing only, not PSBT signing.
 *
 * - "legacy": [P2PKH (BIP-44)](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)
 * - "segwit": [P2WPKH / native SegWit (BIP-84)](https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki)
 * TODO: Add support for P2SH-wrapped SegWit (BIP-49) and BIP-86 (Taproot).
 */
export type BtcAddressType = "legacy" | "segwit";
export type BtcSignerConfig = {
    /**
     * - The name of the network to use (default: "bitcoin").
     */
    network?: "bitcoin" | "regtest" | "testnet";
    /**
     * - The signer's address type (default: "segwit").
     */
    type?: BtcAddressType;
};
export type Psbt = import("bitcoinjs-lib").Psbt;
export type UnsupportedOperationError = import("@tetherto/wdk-wallet").UnsupportedOperationError;
import { ISigner } from "@tetherto/wdk-wallet";
