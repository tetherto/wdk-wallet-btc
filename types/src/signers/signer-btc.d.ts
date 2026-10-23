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
     * @type {ScriptType}
     */
    get type(): ScriptType;
    /**
     * Returns the extended public key (e.g. xpub/tpub).
     *
     * @returns {Promise<string>} The extended public key in base58 format.
     * @throws {UnsupportedOperationError} If the signer does not support account derivation.
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
export type BtcSignerConfig = {
    /**
     * - The name of the network to use (default: "bitcoin").
     */
    network?: "bitcoin" | "regtest" | "testnet";
    /**
     * - The signer's address type (default: "segwit").
     */
    type?: ScriptType;
};
export type Psbt = import("bitcoinjs-lib").Psbt;
export type UnsupportedOperationError = import("@tetherto/wdk-wallet").UnsupportedOperationError;
export type ScriptType = import("../primitives/index.js").ScriptType;
import { ISigner } from "@tetherto/wdk-wallet";
