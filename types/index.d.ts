import { Transaction } from 'bitcoinjs-lib';
import { FeeRates, KeyPair, TransactionResult, TransferOptions, TransferResult } from '@tetherto/wdk-wallet';

export type BtcTransactionReceipt = Transaction;

export type { FeeRates, KeyPair, TransactionResult, TransferOptions, TransferResult };

export type { BtcTransaction, BtcWalletConfig, BtcMaxSpendableResult } from './src/wallet-account-read-only-btc.js';
export type { BtcTransfer } from './src/wallet-account-btc.js';

export type { ElectrumClientConfig, ElectrumBalance, ElectrumUtxo, ElectrumHistoryItem } from './src/transports/electrum-client.js';
export type { MempoolElectrumConfig } from './src/transports/mempool-electrum-client.js';

export { default } from './src/wallet-manager-btc.js';

export { default as WalletAccountReadOnlyBtc } from './src/wallet-account-read-only-btc.js';

export { default as WalletAccountBtc } from './src/wallet-account-btc.js';

export { IElectrumClient, ElectrumClient, MempoolElectrumClient, ElectrumTcp, ElectrumSsl, ElectrumTls, ElectrumWs } from './src/transports/index.js';
