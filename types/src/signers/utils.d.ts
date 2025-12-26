export function hashMessage(message: any): Buffer<ArrayBufferLike>;
export function buildPaymentScript(bip: any, pubkey: any, network: any): Buffer<ArrayBufferLike>;
export function detectInputOwnership(psbtInstance: any, i: any, myScript: any): {
    input: any;
    prevOut: any;
    isOurs: boolean;
};
export function ensureWitnessUtxoIfNeeded(psbtInstance: any, i: any, bip: any, prevOut: any, input: any): void;
export function normalizeConfig(config?: {}): {
    bip: any;
};
export function getAddressFromPublicKey(publicKey: any, network: any, bip?: number): string;
