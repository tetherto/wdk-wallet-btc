export { default } from "./src/wallet-manager-btc.js";
export { default as WalletAccountBtc } from "./src/wallet-account-btc.js";
export type BtcWalletConfig = import("./src/wallet-manager-btc.js").BtcWalletConfig;
export type KeyPair = import("./src/wallet-account-btc.js").KeyPair;
export type BtcTransaction = import("./src/wallet-account-btc.js").BtcTransaction;
export type BtcTransfer = import("./src/wallet-account-btc.js").BtcTransfer;
