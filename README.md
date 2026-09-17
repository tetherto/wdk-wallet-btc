# @tetherto/wdk-wallet-btc

**Note**: This package is currently in beta. Please test thoroughly in development environments before using in production.

A simple and secure package to manage BIP-84 (SegWit) wallets for the Bitcoin blockchain. This package provides a clean API for creating, managing, and interacting with Bitcoin wallets using multiple signing methods including BIP-39 seed phrases, raw private keys, and hardware wallets.

## 🔍 About WDK

This module is part of the [**WDK (Wallet Development Kit)**](https://wallet.tether.io/) project, which empowers developers to build secure, non-custodial wallets with unified blockchain access, stateless architecture, and complete user control.

For detailed documentation about the complete WDK ecosystem, visit [docs.wallet.tether.io](https://docs.wallet.tether.io).

## 🌟 Features

- **Multiple Signing Methods**: Support for seed phrases (BIP-39) and raw private keys
- **Multi-Account Management**: Create and manage multiple accounts from different signers
- **BIP-39 Seed Phrase Support**: Generate and validate BIP-39 mnemonic seed phrases
- **Bitcoin Derivation Paths**: Support for BIP-84 (Native SegWit) and BIP-44 (Legacy) derivation paths
- **Transaction Management**: Create, sign, and broadcast Bitcoin transactions
- **UTXO Management**: Track and manage unspent transaction outputs using Electrum servers

## ⬇️ Installation

To install the `@tetherto/wdk-wallet-btc` package, follow these instructions:

You can install it using npm:

```bash
npm install @tetherto/wdk-wallet-btc
```

## 🚀 Quick Start

### Importing from `@tetherto/wdk-wallet-btc`

```javascript
import WalletManagerBtc, { WalletAccountBtc } from "@tetherto/wdk-wallet-btc";
import {
  SeedSignerBtc,
  PrivateKeySignerBtc,
} from "@tetherto/wdk-wallet-btc/signers";
```

### Creating Wallets with Different Signers

#### Using Seed Phrase Signer (HD Wallets)

```javascript
import WalletManagerBtc from "@tetherto/wdk-wallet-btc";
import { SeedSignerBtc } from "@tetherto/wdk-wallet-btc/signers";

// Use a BIP-39 seed phrase (replace with your own secure phrase)
const seedPhrase =
  "test only example nut use this real life secret phrase must random";

// Create a root seed signer at the purpose/coin-type level, so the wallet
// manager can derive accounts below it (e.g. m/84'/0'/0'/0/0)
const seedSigner = new SeedSignerBtc(seedPhrase, "m/84'/0'", { network: "bitcoin" });

// Create wallet manager with signer and Electrum server config
const wallet = new WalletManagerBtc(seedSigner, {
  client: {
    type: "electrum",
    clientConfig: { host: "electrum.blockstream.info", port: 50001 },
  },
  network: "bitcoin", // 'bitcoin', 'testnet', or 'regtest'
});

// Blockbook REST
// const wallet = new WalletManagerBtc(seedSigner, {
//   client: { type: 'blockbook-http', clientConfig: { url: 'https://btc1.trezor.io/api' } },
//   network: 'bitcoin'
// })

// WebSocket Electrum
// const wallet = new WalletManagerBtc(seedSigner, {
//   client: { type: 'electrum-ws', clientConfig: { url: 'wss://electrum.example.com:50004' } },
//   network: 'bitcoin'
// })

// Pre-built client instance
// import { ElectrumTcp, BlockbookClient } from '@tetherto/wdk-wallet-btc'
// const client = new ElectrumTcp({ host: '...', port: 50001 })
// const wallet = new WalletManagerBtc(seedSigner, { client })

// Failover — array of clients, tries each in order
// const wallet = new WalletManagerBtc(seedSigner, {
//   client: [
//     { type: 'blockbook-http', clientConfig: { url: 'https://btc1.trezor.io/api' } },
//     { type: 'electrum', clientConfig: { host: 'electrum.blockstream.info', port: 50001 } },
//   ],
//   network: 'bitcoin'
// })

// Get a full access account (uses BIP-84 derivation path)
const account = await wallet.getAccount(0);

// Get the account's address (Native SegWit by default)
const address = await account.getAddress();
console.log("Account address:", address);
// Convert to a read-only account
const readOnlyAccount = await account.toReadOnlyAccount();
```

#### Using Private Key Signer (Non-HD Wallets)

Private-key signers are not derivable, so they cannot be the wallet manager's default signer. Register them by name via `addSigner`, or create a standalone account with `WalletAccountBtc.fromPrivateKey`.

```javascript
import { WalletAccountBtc } from "@tetherto/wdk-wallet-btc";
import { PrivateKeySignerBtc } from "@tetherto/wdk-wallet-btc/signers";

// Use a raw private key (hex format)
const privateKey =
  "a1b2c3d4e5f6789abcdef0123456789abcdef0123456789abcdef0123456789ab";

// Option 1: register the signer by name on an existing wallet manager
const pkSigner = new PrivateKeySignerBtc(privateKey);
wallet.addSigner("my-key", pkSigner);
const account = await wallet.getAccount("my-key");
const address = await account.getAddress();
console.log("Account address:", address);

// Option 2: standalone account (no manager)
const standalone = WalletAccountBtc.fromPrivateKey(privateKey, {
  client: {
    type: "electrum",
    clientConfig: { host: "electrum.blockstream.info", port: 50001 },
  },
  network: "bitcoin", // 'bitcoin', 'testnet', or 'regtest'
});
```

#### Single Account (no manager): Seed + path

```javascript
import { WalletAccountBtc } from "@tetherto/wdk-wallet-btc";

// From a BIP-39 seed phrase (or seed bytes) and a derivation path
const account = new WalletAccountBtc(seedPhrase, "0'/0/0", {
  network: "bitcoin", // 'bitcoin', 'testnet', or 'regtest'
});
```

**Note**: This implementation uses BIP-84 derivation paths by default and generates Native SegWit (bech32) addresses. BIP-44 (legacy) addresses are also supported via the `bip` configuration option.

**Important Note about Electrum Servers**:
While the package defaults to `electrum.blockstream.info` if no host is specified, **we strongly recommend configuring your own Electrum server** for production use. Public servers like Blockstream's can be significantly slower (10-300x) and may fail when fetching transaction history for popular addresses with many transactions. For better performance, consider using alternative public servers like `fulcrum.frznode.com` for development, or set up your own Fulcrum server for production environments.

### Managing Multiple Accounts

```javascript
import WalletManagerBtc from "@tetherto/wdk-wallet-btc";

// Assume wallet is already created
// Get the first account (index 0)
const account = await wallet.getAccount(0);
const address = await account.getAddress();
console.log("Account 0 address:", address);

// Get the second account (index 1)
const account1 = await wallet.getAccount(1);
const address1 = await account1.getAddress();
console.log("Account 1 address:", address1);

// Get account by custom derivation path
// Full path will be m/84'/0'/0'/0/5 (mainnet) or m/84'/1'/0'/0/5 (testnet/regtest)
const customAccount = await wallet.getAccountByPath("0'/0/5");
const customAddress = await customAccount.getAddress();
console.log("Custom account address:", customAddress);

// All accounts inherit the provider configuration from the wallet manager
```

### Methods

**Note**: This implementation generates Native SegWit (bech32) addresses by default. All accounts use BIP-84 derivation paths (`m/84'/0'/account'/0/index` for mainnet, `m/84'/1'/account'/0/index` for testnet/regtest).

### Checking Balances

#### Account Balance

```javascript
import WalletManagerBtc from "@tetherto/wdk-wallet-btc";

// Assume wallet and account are already created
// Get balance in satoshis
const balance = await account.getBalance()
console.log('Balance:', balance, 'satoshis') // 1 BTC = 100,000,000 satoshis

// Get transfer history (incoming and outgoing transfers)
const allTransfers = await account.getTransfers();
console.log("Recent transfers (last 10):", allTransfers);

// Get transfer history with options
const incomingTransfers = await account.getTransfers({
  direction: "incoming", // 'incoming', 'outgoing', or 'all'
  limit: 20, // Number of transfers to fetch
  skip: 0, // Number of transfers to skip
});
console.log("Incoming transfers:", incomingTransfers);

// Note: Provider is required for balance checks
// Make sure wallet was created with Electrum server configuration
```

**Important Notes:**
- When the client reports `unconfirmedOutgoing`, unconfirmed incoming funds aren't counted (since they aren't spendable yet) but unconfirmed outgoing funds are subtracted immediately. Clients that can't compute `unconfirmedOutgoing` fall back to netting the raw unconfirmed balance.
  - **Blockbook** (`blockbook-http`) computes `unconfirmedOutgoing`: a pending spend of yours is subtracted as soon as it's broadcast, following the same trust rule as Bitcoin Core's own wallet - it only counts if every input it draws from is itself confirmed, or comes from another one of your pending transactions that's *also* trusted by that same rule.
  - **Electrum** (`electrum`, `electrum-ws`) doesn't compute `unconfirmedOutgoing`, so it falls back to the server's raw net mempool delta, which is coarser and can include unconfirmed incoming amounts too. Any client that does implement `unconfirmedOutgoing` should follow Blockbook's same trust rule, so `getBalance()` behaves consistently across providers.
- There's no direct UTXO access method - UTXOs are managed internally
- Use `getTransfers()` instead of `getTransactionHistory()` for transaction data
- Transfer objects include transaction ID, value, direction, fee, and block height information

### Sending Transactions

Send Bitcoin and estimate fees using `WalletAccountBtc`. Uses Electrum servers for broadcasting.

```javascript
// Send Bitcoin (single recipient only)
const result = await account.sendTransaction({
  to: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", // Recipient's Bitcoin address
  value: 50000n, // Amount in satoshis
  feeRate: 10n, // Optional: fee rate in sat/vB (auto-estimated if not provided)
  confirmationTarget: 1, // Optional: target blocks for confirmation (default: 1)
});
console.log("Transaction hash:", result.hash);
console.log("Transaction fee:", result.fee, "satoshis");

// Get transaction fee estimate
const quote = await account.quoteSendTransaction({
  to: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  value: 50000n,
});
console.log("Estimated fee:", quote.fee, "satoshis");
```

**Important Notes:**

- Bitcoin transactions support **single recipient only** (no multiple recipients in one call)
- Fee rate is calculated automatically based on network conditions if not provided
- Transaction amounts and fees are always in **satoshis** (1 BTC = 100,000,000 satoshis)
- `sendTransaction()` returns `hash` and `fee` properties
- `quoteSendTransaction()` returns only the `fee` estimate

### Message Signing and Verification

Sign messages using `WalletAccountBtc`. Verify messages using `WalletAccountReadOnlyBtc` (also available on `WalletAccountBtc` through inheritance).

```javascript
// Sign a message
const message = "Hello, Bitcoin!";
const signature = await account.sign(message);
console.log("Signature:", signature);

// Verify a signature
const isValid = await account.verify(message, signature);
console.log("Signature valid:", isValid);
```

### Fee Management

Retrieve current fee rates using `WalletManagerBtc`. Rates are provided in satoshis per virtual byte (sat/vB).

```javascript
// Get current fee rates
const feeRates = await wallet.getFeeRates();
console.log("Normal fee rate:", feeRates.normal, "sat/vB"); // Standard confirmation time (~1 hour)
console.log("Fast fee rate:", feeRates.fast, "sat/vB"); // Faster confirmation time
```

**Important Notes:**

- Fee rates are fetched from mempool.space API
- `getFeeRates()` returns only `normal` and `fast` fee rates (no `economic` or `priority`)
- Fee estimation is done via `quoteSendTransaction()` method, not a separate `estimateFee()` method
- Fee rates are automatically calculated based on network conditions and UTXO selection
- Actual fees depend on transaction size (number of inputs/outputs) and current network congestion

### Memory Management

Clear sensitive data from memory using `dispose` methods.

```javascript
// Dispose wallet account to clear private keys from memory
account.dispose();

// Dispose entire wallet manager
wallet.dispose();
```

**Ownership semantics**: accounts and managers only wipe signers they own. A manager created from a seed phrase wipes the signer it built internally; a manager created from a signer you constructed never wipes it — you remain responsible for calling `signer.dispose()` yourself. Likewise, accounts wipe the signer given at construction only when created with `{ shouldWipeSignerOnDisposal: true }` (set automatically for accounts the manager derives and for `WalletAccountBtc.fromPrivateKey`).

## 🔐 Signers

The package supports multiple signer types for different use cases and security models:

### SeedSignerBtc (HD Wallets)

**Best for**: Most users, backup/recovery, multiple accounts

- Uses BIP-39 seed phrases for hierarchical deterministic (HD) wallets
- Supports BIP-44 (legacy) and BIP-84 (Native SegWit) derivation paths
- Allows creating multiple accounts from a single seed phrase
- Provides strong security through HD derivation

Each signer holds exactly one HD node at its `path`, and `derive(relPath)` returns a child signer relative to that node. Construct a signer with an intermediate path (e.g. `"m/84'/0'"`) when you need a root that can derive accounts below it — for example, as a wallet manager's default signer.

```javascript
// Leaf signer at the default first account (m/84'/0'/0'/0/0 on mainnet)
const seedSigner = new SeedSignerBtc("your seed phrase here", {
  network: "bitcoin",
});

// Root signer at the purpose/coin-type level, able to derive accounts below it
const rootSigner = new SeedSignerBtc("your seed phrase here", "m/84'/0'", {
  network: "bitcoin",
});
const child = await rootSigner.derive("0'/0/1"); // signer at m/84'/0'/0'/0/1
```

### PrivateKeySignerBtc (Non-HD Wallets)

**Best for**: Single-key usage, imported keys, testing

- Uses raw private keys directly (no HD derivation)
- Suitable for single addresses or imported keys
- Cannot create multiple accounts from one key
- Not derivable, so it cannot be a wallet manager's default signer — register it by name via `addSigner` or use `WalletAccountBtc.fromPrivateKey`

```javascript
const pkSigner = new PrivateKeySignerBtc("a1b2c3d4e5f6789abcdef...", {
  network: "bitcoin",
});
```

## 📚 API Reference

### Table of Contents

| Class                                                 | Description                                                                                                                                       | Methods                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [WalletManagerBtc](#walletmanagerbtc)                 | Main class for managing Bitcoin wallets. Extends `WalletManager` from `@tetherto/wdk-wallet`.                                                     | [Constructor](#constructor), [Methods](#methods)                                |
| [WalletAccountBtc](#walletaccountbtc)                 | Individual Bitcoin wallet account implementation. Extends `WalletAccountReadOnlyBtc` and implements `IWalletAccount` from `@tetherto/wdk-wallet`. | [Constructor](#constructor-1), [Methods](#methods-1), [Properties](#properties) |
| [WalletAccountReadOnlyBtc](#walletaccountreadonlybtc) | Read-only Bitcoin wallet account. Extends `WalletAccountReadOnly` from `@tetherto/wdk-wallet`.                                                    | [Constructor](#constructor-2), [Methods](#methods-2)                            |

### WalletManagerBtc

The main class for managing Bitcoin wallets.  
Extends `WalletManager` from `@tetherto/wdk-wallet`.

#### Constructor

```javascript
new WalletManagerBtc(seedOrSigner, config);
```

**Parameters:**

- `seedOrSigner` (string | Uint8Array | ISigner): Either a BIP-39 seed phrase (or raw seed bytes), or a **derivable** signer to use as the default signer. Non-derivable signers (e.g. `PrivateKeySignerBtc`) throw an `InvalidSignerError` here — register them by name via `addSigner` instead
- `config` (BtcWalletConfig, optional): Configuration object
  - `network` (string, optional): "bitcoin", "testnet", or "regtest" (default: "bitcoin")
  - `bip` (number, optional): BIP address type - 44 (legacy) or 84 (native SegWit) (default: 84)
  - `client` — one of:
    - An `IBtcClient` instance (pre-built client)
    - A descriptor `{ type, clientConfig }` where type is `'electrum'`, `'blockbook-http'`, or `'electrum-ws'`
    - An array of the above (for failover — tries each in order)

When given a seed, the manager builds its default signer internally at the purpose/coin-type root (e.g. `m/84'/0'` for mainnet BIP-84) and wipes it on `dispose()`. When given a signer, the signer is used exactly as given — the manager never wipes a signer you supplied, and `wallet.seed` is `undefined`. To let the manager derive accounts correctly, a supplied default signer should sit at the purpose/coin-type root.

**Example:**

```javascript
import { SeedSignerBtc } from "@tetherto/wdk-wallet-btc/signers";

// From a signer rooted at the purpose/coin-type level
const signer = new SeedSignerBtc(seedPhrase, "m/84'/0'", { network: "bitcoin" });
const wallet = new WalletManagerBtc(signer, {
  client: {
    type: "electrum",
    clientConfig: { host: "electrum.blockstream.info", port: 50001 },
  },
  network: "bitcoin",
});

// Or directly from a seed phrase
const walletFromSeed = new WalletManagerBtc(seedPhrase, { network: "bitcoin" });
```

#### Methods

| Method                                | Description                                                      | Returns                                   |
| ------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------- |
| `getAccount(indexOrSignerName?, options?)` | Returns a wallet account at the specified index, or the account for a registered signer name | `Promise<WalletAccountBtc>`     |
| `getAccountByPath(path, options?)`    | Returns a wallet account at the specified BIP-84 derivation path | `Promise<WalletAccountBtc>`               |
| `addSigner(name, signer)`             | Registers a named signer with the wallet manager (inherited from the base manager) | `WalletManagerBtc`      |
| `getFeeRates()`                       | Returns current fee rates for transactions                       | `Promise<{normal: number, fast: number}>` |
| `dispose()`                           | Disposes all wallet accounts, clearing private keys from memory  | `void`                                    |

##### `getAccount(indexOrSignerName, options)`

Returns a wallet account at the specified index using BIP derivation, or — when passed a string — the account associated with a registered signer name.

**Parameters:**

- `indexOrSignerName` (number | string, optional): The account index (default: 0), or the name of a signer registered via `addSigner`
- `options` (object, optional): Account options
  - `options.signerName` (string, optional): The name of the signer to derive from. Omit to use the default signer

**Returns:** `Promise<WalletAccountBtc>` - The wallet account

**Note on the signer-name overload**: `getAccount(signerName)` never derives — it wraps the registered signer exactly as given, wherever it happens to sit. For a private-key signer that's its one account; for a derivable signer it's the account at that signer's own current path, which is rarely what you want to transact with if the signer sits at an intermediate path. To get a derived leaf from a named derivable signer, use `getAccount(index, { signerName })` or `getAccountByPath(path, { signerName })` — both always derive. Disposing an account returned by the signer-name overload leaves the registered signer untouched.

**Example:**

```javascript
// Returns the account with derivation path:
// For mainnet (bitcoin): m/84'/0'/0'/0/1
// For testnet or regtest: m/84'/1'/0'/0/1
const account = await wallet.getAccount(1);

// Account wrapping a registered signer, as-is (no derivation)
const pkAccount = await wallet.getAccount("my-key");
```

##### `getAccountByPath(path, options)`

Returns a wallet account at the specified BIP-84 derivation path.

**Parameters:**

- `path` (string): The derivation path (e.g., "0'/0/0")
- `options` (object, optional): Account options
  - `options.signerName` (string, optional): The name of the signer to derive from. Omit to use the default signer

**Returns:** `Promise<WalletAccountBtc>` - The wallet account

**Example:**

```javascript
// Returns the account with derivation path:
// For mainnet (bitcoin): m/84'/0'/0'/0/1
// For testnet or regtest: m/84'/1'/0'/0/1
const account = await wallet.getAccountByPath("0'/0/1");
```

##### `getFeeRates()`

Returns current fee rates from mempool.space API.

**Returns:** `Promise<{normal: bigint, fast: bigint}>` - Object containing fee rates in sat/vB

- `normal`: Standard fee rate for confirmation within ~1 hour
- `fast`: Higher fee rate for faster confirmation

**Example:**

```javascript
const feeRates = await wallet.getFeeRates();
console.log("Normal fee rate:", feeRates.normal, "sat/vB");
console.log("Fast fee rate:", feeRates.fast, "sat/vB");
```

##### `addSigner(signerName, signer)`

Registers a named signer with the wallet manager for use with multiple accounts. Inherited from the base `WalletManager`. The default signer (provided at construction) is kept separately and is never stored here.

**Parameters:**

- `signerName` (string): A unique name for the signer
- `signer` (ISignerBtc): The signer instance to register

**Returns:** `WalletManagerBtc` - The wallet manager (for chaining)

**Example:**

```javascript
import { PrivateKeySignerBtc } from "@tetherto/wdk-wallet-btc/signers";

const pkSigner = new PrivateKeySignerBtc("a1b2c3d4...", { network: "bitcoin" });
wallet.addSigner("my-key", pkSigner);
const account = await wallet.getAccount("my-key");
```

##### `dispose()`

Disposes all wallet accounts, clears sensitive data from memory, and closes internally-created client connections (externally-provided clients are left open). The default signer is wiped only if the manager created it internally from a seed; caller-supplied default signers and signers registered via `addSigner` are never wiped.

**Returns:** `void`

**Example:**

```javascript
wallet.dispose();
```

### WalletAccountBtc

Represents an individual Bitcoin wallet account. Extends `WalletAccountReadOnlyBtc` and implements `IWalletAccount` from `@tetherto/wdk-wallet`.

#### Constructor

```javascript
new WalletAccountBtc(seed, path, config);
// or
new WalletAccountBtc(signer, config);
```

**Parameters (seed overload):**

- `seed` (string | Uint8Array): BIP-39 mnemonic seed phrase or seed bytes
- `path` (string): Derivation path relative to the BIP root (e.g., "0'/0/0")
- `config` (BtcWalletConfig, optional): Configuration object (see [WalletManagerBtc constructor](#constructor) for details)

**Parameters (signer overload):**

- `signer` (ISignerBtc): The signer backing the account. The network and BIP are taken from the signer
- `config` (BtcAccountConfig & SignerOptions, optional): Configuration object. `shouldWipeSignerOnDisposal` (boolean, optional) makes `dispose()` wipe the given signer too — by default a caller-supplied signer is never wiped

There is also a static factory for raw private keys:

```javascript
const account = WalletAccountBtc.fromPrivateKey(privateKey, config);
```

#### Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `getAddress()` | Returns the account's Bitcoin address | `Promise<string>` |
| `getBalance()` | Returns the account's balance in satoshis (see [Checking Balances](#checking-balances)) | `Promise<bigint>` |
| `sendTransaction(options)` | Sends a Bitcoin transaction | `Promise<{hash: string, fee: bigint}>` |
| `quoteSendTransaction(options)` | Estimates the fee for a transaction | `Promise<{fee: bigint}>` |
| `getTransfers(options?)` | Returns the account's transfer history | `Promise<BtcTransfer[]>` |
| `getTransactionReceipt(hash)` | Returns a transaction's receipt | `Promise<BtcTransaction \| null>` |
| `getMaxSpendable()` | Returns the maximum spendable amount | `Promise<{amount: bigint, fee: bigint, changeValue: bigint}>` |
| `sign(message)` | Signs a message with the account's private key | `Promise<string>` |
| `verify(message, signature)` | Verifies a message signature | `Promise<boolean>` |
| `toReadOnlyAccount()` | Creates a read-only version of this account | `Promise<WalletAccountReadOnlyBtc>` |
| `dispose()` | Disposes the wallet account, clearing private keys from memory | `void` |

##### `getAddress()`

Returns the account's Bitcoin address (Native SegWit bech32 by default, or legacy if using BIP-44).

**Returns:** `Promise<string>` - The Bitcoin address

**Example:**

```javascript
const address = await account.getAddress();
console.log("Address:", address); // bc1q... (BIP-84) or 1... (BIP-44)
```

##### `getBalance()`
Returns the account's balance in satoshis - confirmed funds, plus handling of the account's own pending transactions that varies by provider. See [Checking Balances](#checking-balances) for details.

**Returns:** `Promise<bigint>` - Balance in satoshis

**Example:**

```javascript
const balance = await account.getBalance();
console.log("Balance:", balance, "satoshis");
```

##### `sendTransaction(options)`

Sends a Bitcoin transaction to a single recipient.

**Parameters:**

- `options` (object): Transaction options
  - `to` (string): Recipient's Bitcoin address
  - `value` (number | bigint): Amount in satoshis
  - `feeRate` (number | bigint, optional): Fee rate in sat/vB (auto-estimated if not provided)
  - `confirmationTarget` (number, optional): Target blocks for confirmation (default: 1)

**Returns:** `Promise<{hash: string, fee: bigint}>` - Object containing hash and fee (in satoshis)

**Example:**

```javascript
const result = await account.sendTransaction({
  to: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  value: 50000n,
});
console.log("Transaction hash:", result.hash);
console.log("Fee:", result.fee, "satoshis");
```

##### `quoteSendTransaction(options)`

Estimates the fee for a transaction without broadcasting it.

**Parameters:**

- `options` (object): Same as sendTransaction options
  - `to` (string): Recipient's Bitcoin address
  - `value` (number | bigint): Amount in satoshis
  - `feeRate` (number | bigint, optional): Fee rate in sat/vB (auto-estimated if not provided)
  - `confirmationTarget` (number, optional): Target blocks for confirmation (default: 1)

**Returns:** `Promise<{fee: bigint}>` - Object containing estimated fee (in satoshis)

**Example:**

```javascript
const quote = await account.quoteSendTransaction({
  to: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  value: 50000n,
});
console.log("Estimated fee:", quote.fee, "satoshis");
```

##### `getTransfers(options?)`

Returns the account's transfer history with detailed transaction information.

**Parameters:**

- `options` (object, optional): Filter options
  - `direction` (string, optional): 'incoming', 'outgoing', or 'all' (default: 'all')
  - `limit` (number, optional): Maximum number of transfers (default: 10)
  - `skip` (number, optional): Number of transfers to skip (default: 0)

**Returns:** `Promise<BtcTransfer[]>` - Array of transfer objects

**Example:**

```javascript
const transfers = await account.getTransfers({
  direction: "incoming",
  limit: 5,
});
console.log("Recent incoming transfers:", transfers);
```

##### `getTransactionReceipt(hash)`

Returns a transaction's receipt if it has been included in a block.

**Parameters:**

- `hash` (string): The transaction hash (64 hex characters)

**Returns:** `Promise<BtcTransaction | null>` - The transaction object, or null if not yet confirmed

**Example:**

```javascript
const receipt = await account.getTransactionReceipt("abc123...");
if (receipt) {
  console.log("Transaction confirmed");
}
```

##### `getMaxSpendable()`

Returns the maximum spendable amount that can be sent in a single transaction. The maximum spendable amount can differ from the wallet's total balance for several reasons:

- **Transaction fees**: Fees are subtracted from the total balance
- **Uneconomic UTXOs**: Small UTXOs where the fee to spend them exceeds their value are excluded
- **UTXO limit**: A transaction can include at most 200 inputs. Wallets with more UTXOs cannot spend their full balance in a single transaction.
- **Dust limit**: Outputs below the dust threshold (294 sats for SegWit, 546 sats for legacy) cannot be created

**Returns:** `Promise<{amount: bigint, fee: bigint, changeValue: bigint}>` - Maximum spendable result

**Example:**

```javascript
const { amount, fee } = await account.getMaxSpendable();
console.log("Max spendable:", amount, "satoshis");
console.log("Estimated fee:", fee, "satoshis");
```

##### `sign(message)`

Signs a message using the account's private key.

**Parameters:**

- `message` (string): Message to sign

**Returns:** `Promise<string>` - Signature as base64 string

**Example:**

```javascript
const signature = await account.sign("Hello Bitcoin!");
console.log("Signature:", signature);
```

##### `verify(message, signature)`

Verifies a message signature using the account's public key.

**Parameters:**

- `message` (string): Original message
- `signature` (string): Signature as base64 string

**Returns:** `Promise<boolean>` - True if signature is valid

**Example:**

```javascript
const isValid = await account.verify("Hello Bitcoin!", signature);
console.log("Signature valid:", isValid);
```

**Note**: The `verify` method is available on `WalletAccountReadOnlyBtc` and is inherited by `WalletAccountBtc`.

##### `toReadOnlyAccount()`

Creates a read-only version of this account that can query balances but cannot sign transactions.

**Returns:** `Promise<WalletAccountReadOnlyBtc>` - The read-only account

**Example:**

```javascript
const readOnlyAccount = await account.toReadOnlyAccount();
const balance = await readOnlyAccount.getBalance();
```

##### `dispose()`

Disposes the wallet account, securely erasing the private key from memory and closing internally-created client connections. The signer given at construction is wiped only if the account owns it (i.e. it was created via the seed overload or `fromPrivateKey`, or `shouldWipeSignerOnDisposal` was set); a caller-supplied signer is never wiped.

**Returns:** `void`

**Example:**

```javascript
account.dispose();
// Private key is now securely wiped from memory
```

**Note**: `getTokenBalance()`, `transfer()`, and `quoteTransfer()` methods are not supported on the Bitcoin blockchain and will throw errors.

#### Properties

| Property  | Type              | Description                                                                                                       |
| --------- | ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| `path`    | `string \| null`  | The full derivation path of this account, or null if the account's signer is not bound to a derivation position (e.g. private-key signers) |
| `keyPair` | `KeyPair \| null` | The account's key pair (⚠️ Contains sensitive data), or null after disposal or for signers that can't expose keys |

⚠️ **Security Note**: The `keyPair` property contains sensitive cryptographic material. Never log, display, or expose the private key.

### WalletAccountReadOnlyBtc

Represents a read-only Bitcoin wallet account. Extends `WalletAccountReadOnly` from `@tetherto/wdk-wallet`.

```javascript
new WalletAccountReadOnlyBtc(address, config);
```

**Parameters:**

- `address` (string): The account's Bitcoin address
- `config` (BtcWalletConfig, optional): Configuration object (see [WalletManagerBtc constructor](#constructor) for details)

#### Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `getBalance()` | Returns the account's balance in satoshis (see [Checking Balances](#checking-balances)) | `Promise<bigint>` |
| `quoteSendTransaction(options)` | Estimates the fee for a transaction | `Promise<{fee: bigint}>` |
| `getTransactionReceipt(hash)` | Returns a transaction's receipt | `Promise<BtcTransaction \| null>` |
| `getMaxSpendable()` | Returns the maximum spendable amount | `Promise<{amount: bigint, fee: bigint, changeValue: bigint}>` |

### SeedSignerBtc

HD wallet signer using BIP-39 seed phrases for hierarchical deterministic wallets. Each signer holds exactly one HD node at its `path`; `derive` returns child signers relative to that node.

#### Constructor

```javascript
new SeedSignerBtc(seed, path, config);
```

**Parameters:**

- `seed` (string | Uint8Array): BIP-39 mnemonic seed phrase or seed bytes
- `path` (string, optional): The absolute derivation path of the signer's node (default: the first account for the configured address type, e.g. `m/84'/0'/0'/0/0` on mainnet). The path is not required to match the configured address type's purpose
- `config` (BtcSignerConfig, optional): Signer configuration
  - `network` (string, optional): "bitcoin", "testnet", or "regtest" (default: "bitcoin")
  - `type` (string, optional): "legacy" (P2PKH) or "segwit" (P2WPKH) (default: "segwit") — governs address encoding and message signing only

**Example:**

```javascript
// Leaf signer at the default first account
const signer = new SeedSignerBtc(seedPhrase, { network: "bitcoin" });

// Root signer that can derive accounts below it
const root = new SeedSignerBtc(seedPhrase, "m/84'/0'", { network: "bitcoin" });
```

There is also a static factory for extended private keys — the imported node becomes the signer's root, at path `"m"`:

```javascript
const signer = SeedSignerBtc.fromXprv(xprv, config);
```

#### Methods

| Method                   | Description                                                      | Returns                  |
| ------------------------ | ---------------------------------------------------------------- | ------------------------ |
| `derive(relPath)`        | Derives a child signer at the given path relative to this signer | `Promise<SeedSignerBtc>` |
| `getAddress()`           | Returns the signer's address                                     | `Promise<string>`        |
| `sign(message)`          | Signs a message using the private key (BIP-137)                  | `Promise<string>`        |
| `signPsbt(psbt)`         | Signs every PSBT input the key controls (any script type); returns base64, not finalized | `Promise<string>`        |
| `getExtendedPublicKey()` | Returns the extended public key (xpub) of the signer's node      | `Promise<string>`        |
| `dispose()`              | Clears private keys from memory                                  | `void`                   |

#### Properties

| Property       | Type              | Description                                                        |
| -------------- | ----------------- | ------------------------------------------------------------------ |
| `path`         | `string`          | The absolute derivation path of this signer's node                 |
| `address`      | `string`          | The signer's address                                               |
| `network`      | `string`          | The configured network ("bitcoin", "testnet", or "regtest")        |
| `type`         | `string`          | The configured address type ("legacy" or "segwit")                 |
| `keyPair`      | `KeyPair \| null` | The signer's key pair (⚠️ Contains sensitive data); nulls after disposal |
| `isDerivable`  | `boolean`         | Always true — every seed signer can derive children                |

### PrivateKeySignerBtc

Non-HD signer using raw private keys directly.

#### Constructor

```javascript
new PrivateKeySignerBtc(privateKey, config);
```

**Parameters:**

- `privateKey` (string | Uint8Array | Buffer): Raw private key (hex string or 32 bytes)
- `config` (BtcSignerConfig, optional): Signer configuration (`network` and `type`, see [SeedSignerBtc constructor](#constructor-2))

**Example:**

```javascript
const signer = new PrivateKeySignerBtc("a1b2c3d4e5f6789abcdef...", config);
```

#### Methods

| Method                   | Description                                                       | Returns           |
| ------------------------ | ----------------------------------------------------------------- | ----------------- |
| `getAddress()`           | Returns the signer's address                                      | `Promise<string>` |
| `sign(message)`          | Signs a message using the private key (BIP-137)                   | `Promise<string>` |
| `signPsbt(psbt)`         | Signs every PSBT input the key controls (any script type); returns base64, not finalized | `Promise<string>` |
| `derive(path)`           | Not supported — always throws an `UnsupportedOperationError`      | `Promise<never>`  |
| `getExtendedPublicKey()` | Not supported — always throws an `UnsupportedOperationError`      | `Promise<never>`  |
| `dispose()`              | Clears private keys from memory                                   | `void`            |

#### Properties

| Property      | Type              | Description                                                        |
| ------------- | ----------------- | ------------------------------------------------------------------ |
| `path`        | `null`            | Always null — the signer is not bound to a derivation position     |
| `address`     | `string`          | The signer's address                                               |
| `network`     | `string`          | The configured network ("bitcoin", "testnet", or "regtest")        |
| `type`        | `string`          | The configured address type ("legacy" or "segwit")                 |
| `keyPair`     | `KeyPair \| null` | The signer's key pair (⚠️ Contains sensitive data); nulls after disposal |
| `isDerivable` | `boolean`         | Always false — private-key signers cannot derive child accounts    |

## 🌐 Supported Networks

This package works with Bitcoin networks:

- **Bitcoin Mainnet** (`"bitcoin"`)
- **Bitcoin Testnet** (`"testnet"`)
- **Bitcoin Regtest** (`"regtest"`)

### Electrum Server Configuration

**Important**: While the package defaults to `electrum.blockstream.info:50001` for convenience, **we strongly recommend configuring your own Electrum server** for production use.

#### Recommended Approach:

**For Production:**

- Set up your own Fulcrum server for optimal performance and reliability
- Use recent Fulcrum versions that support pagination for high-transaction addresses

**For Development/Testing:**

- `fulcrum.frznode.com:50001` - Generally faster than default
- `electrum.blockstream.info:50001` - Default fallback

**Performance Note**: Public Electrum servers may be 10-300x slower and can fail for addresses with many transactions. Always use your own infrastructure for production applications.

### Supported Address Types

This implementation supports the following address types:

- **Native SegWit (P2WPKH)** (default, BIP-84): Addresses starting with 'bc1' (mainnet) or 'tb1' (testnet)
  - Uses BIP-84 derivation paths (`m/84'/0'/account'/0/index` for mainnet)
  - Lower transaction fees compared to legacy formats
  - Full SegWit benefits including transaction malleability protection

- **Legacy (P2PKH)** (BIP-44): Addresses starting with '1' (mainnet) or 'm'/'n' (testnet)
  - Uses BIP-44 derivation paths (`m/44'/0'/account'/0/index` for mainnet)
  - Enable via `{ bip: 44 }` in config

## 🔒 Security Considerations

- **Seed Phrase Security**: Always store your seed phrase securely and never share it
- **Private Key Management**: The package handles private keys internally with memory safety features
- **Network Security**: Use trusted Electrum servers or run your own for production
- **Transaction Validation**: Always verify recipient addresses before sending
- **Memory Cleanup**: Use the `dispose()` method to clear private keys from memory when done
- **UTXO Management**: UTXO selection and change handling is managed automatically by the wallet
- **Fee Management**: Fee rates are fetched from mempool.space API automatically
- **Address Format**: Native SegWit (bech32) addresses are used by default

## 🛠️ Development

### Building

```bash
# Install dependencies
npm install

# Build TypeScript definitions
npm run build:types

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix
```

### Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## 📜 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 🆘 Support

For support, please open an issue on the GitHub repository.

---
