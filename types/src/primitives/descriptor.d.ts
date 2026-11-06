/**
 * Builds the output descriptor of a single-key script.
 *
 * @param {DescriptorParams} params
 * @returns {string} The descriptor.
 * @throws {ValueError} If the script type is not supported or the key parameters are inconsistent.
 */
export function getDescriptor(params: DescriptorParams): string;
/**
 * Builds the output descriptor of an address.
 *
 * @param {string} address - The address.
 * @returns {string} The descriptor.
 */
export function getAddressDescriptor(address: string): string;
export type ScriptType = import("./index.js").ScriptType;
export type BIP32Interface = import("bip32").BIP32Interface;
/**
 * The key origin of a descriptor key, as defined by BIP-380.
 */
export type KeyOrigin = {
    /**
     * - The fingerprint of the master key (8 hex characters).
     */
    fingerprint: string;
    /**
     * - The derivation path from the master key down to the key, with a leading slash (e.g. "/84'/0'/0'").
     */
    path?: string;
};
/**
 * A key given as an extended public key.
 */
export type XpubKeyParams = {
    /**
     * - The extended public key (xpub on mainnet, tpub on testnet and regtest).
     */
    xpub: string;
    /**
     * - The derivation path below the extended public key (e.g. "/0/*", "/<0;1>/*"). The `*` and the multipath are resolved by the `index` and `change` given to `Output`. If omitted, the key is used as is.
     */
    keyPath?: string;
    /**
     * - The key origin.
     */
    origin?: KeyOrigin;
};
/**
 * A key given as a bare public key.
 */
export type PubkeyKeyParams = {
    /**
     * - The hex-encoded public key.
     */
    pubkey: string;
    /**
     * - The key origin.
     */
    origin?: KeyOrigin;
};
/**
 * A key derived from a BIP-32 master node.
 */
export type MasterNodeKeyParams = {
    /**
     * - The master node. Its fingerprint is used as the key origin's fingerprint.
     */
    masterNode: BIP32Interface;
    /**
     * - The derivation path from the master node down to the key, with a leading slash (e.g. "/84'/0'/0'").
     */
    origin: {
        path: string;
    };
    /**
     * - The derivation path below the derived key (e.g. "/0/*"). The `*` and any multipath are resolved by the `index` and `change` given to `Output`. If omitted, the key is used as is.
     */
    keyPath?: string;
    /**
     * - The chain below the derived key (0 for receive, 1 for change), forwarded to the key expression.
     */
    change?: number;
    /**
     * - The address index below the chain, or '*' for a ranged descriptor, forwarded to the key expression.
     */
    index?: number | "*";
};
export type KeyParams = XpubKeyParams | PubkeyKeyParams | MasterNodeKeyParams;
export type DescriptorParams = {
    type: ScriptType;
} & KeyParams;
