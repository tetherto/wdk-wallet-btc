# @tetherto/wdk-wallet-btc

**Note**: This package is currently in beta. Please test thoroughly in development environments before using in production.

A simple and secure package to manage BIP-84 (SegWit) wallets for the Bitcoin blockchain. This package provides a clean API for creating, managing, and interacting with Bitcoin wallets using BIP-39 seed phrases and Bitcoin-specific derivation paths.

## 🔍 About WDK

This module is part of the [**WDK (Wallet Development Kit)**](https://wallet.tether.io/) project, which empowers developers to build secure, non-custodial wallets with unified blockchain access, stateless architecture, and complete user control. 

For detailed documentation about the complete WDK ecosystem, visit [docs.wallet.tether.io](https://docs.wallet.tether.io).

## 🌟 Features

- **BIP-39 Seed Phrase Support**: Generate and validate BIP-39 mnemonic seed phrases
- **Bitcoin Derivation Paths**: Support for BIP-84 (Native SegWit) and BIP-44 (Legacy) derivation paths
- **Multi-Account Management**: Create and manage multiple accounts from a single seed phrase
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

### Creating a New Wallet

```javascript
import WalletManagerBtc, { WalletAccountBtc, ElectrumTcp } from '@tetherto/wdk-wallet-btc'

// Use a BIP-39 seed phrase (replace with your own secure phrase)
const seedPhrase = 'test only example nut use this real life secret phrase must random'

// Choose your Electrum transport - import from '@tetherto/wdk-wallet-btc':
const client = new ElectrumTcp({ host: 'electrum.blockstream.info', port: 50001 })

// import { ElectrumTls, ElectrumSsl, ElectrumWs } from '@tetherto/wdk-wallet-btc'
// const client = new ElectrumTls({ host: 'electrum.blockstream.info', port: 50002 })
// const client = new ElectrumSsl({ host: 'electrum.blockstream.info', port: 50002 })
// const client = new ElectrumWs({ host: 'electrum.blockstream.info', port: 50003 })
//
// Or implement your own by extending IElectrumClient:
// import { IElectrumClient } from '@tetherto/wdk-wallet-btc'
// class MyCustomElectrumClient implements IElectrumClient { ... }

// Create wallet manager with Electrum server config
const wallet = new WalletManagerBtc(seedPhrase, {
  client, // Pass a client instance
  network: 'bitcoin' // 'bitcoin', 'testnet', or 'regtest'
})

// Get a full access account (uses BIP-84 derivation path)
const account = await wallet.getAccount(0)

// Get the account's address (Native SegWit by default)
const address = await account.getAddress()
console.log('Account address:', address)

// Convert to a read-only account
const readOnlyAccount = await account.toReadOnlyAccount()
```

**Note**: This implementation uses BIP-84 derivation paths by default and generates Native SegWit (bech32) addresses. BIP-44 (legacy) addresses are also supported via the `bip` configuration option.

**Important Note about Electrum Servers**: 
While the package defaults to `electrum.blockstream.info` if no host is specified, **we strongly recommend configuring your own Electrum server** for production use. Public servers like Blockstream's can be significantly slower (10-300x) and may fail when fetching transaction history for popular addresses with many transactions. For better performance, consider using alternative public servers like `fulcrum.frznode.com` for development, or set up your own Fulcrum server for production environments.

### Managing Multiple Accounts

```javascript
import WalletManagerBtc from '@tetherto/wdk-wallet-btc'

// Assume wallet is already created
// Get the first account (index 0)
const account = await wallet.getAccount(0)
const address = await account.getAddress()
console.log('Account 0 address:', address)

// Get the second account (index 1)
const account1 = await wallet.getAccount(1)
const address1 = await account1.getAddress()
console.log('Account 1 address:', address1)

// Get account by custom derivation path
// Full path will be m/84'/0'/0'/0/5 (mainnet) or m/84'/1'/0'/0/5 (testnet/regtest)
const customAccount = await wallet.getAccountByPath("0'/0/5")
const customAddress = await customAccount.getAddress()
console.log('Custom account address:', customAddress)

// All accounts inherit the provider configuration from the wallet manager
```
### Methods

**Note**: This implementation generates Native SegWit (bech32) addresses by default. All accounts use BIP-84 derivation paths (`m/84'/0'/account'/0/index` for mainnet, `m/84'/1'/account'/0/index` for testnet/regtest).

### Checking Balances

#### Account Balance

```javascript
import WalletManagerBtc from '@tetherto/wdk-wallet-btc'

// Assume wallet and account are already created
// Get confirmed balance (returns confirmed balance only)
const balance = await account.getBalance()
console.log('Confirmed balance:', balance, 'satoshis') // 1 BTC = 100,000,000 satoshis

// Get transfer history (incoming and outgoing transfers)
const allTransfers = await account.getTransfers()
console.log('Recent transfers (last 10):', allTransfers)

// Get transfer history with options
const incomingTransfers = await account.getTransfers({
  direction: 'incoming', // 'incoming', 'outgoing', or 'all'
  limit: 20,             // Number of transfers to fetch
  skip: 0                // Number of transfers to skip
})
console.log('Incoming transfers:', incomingTransfers)

// Note: Provider is required for balance checks
// Make sure wallet was created with Electrum server configuration
```

**Important Notes:**
- `getBalance()` returns confirmed balance only (no unconfirmed balance option)
- There's no direct UTXO access method - UTXOs are managed internally
- Use `getTransfers()` instead of `getTransactionHistory()` for transaction data
- Transfer objects include transaction ID, value, direction, fee, and block height information

### Sending Transactions

Send Bitcoin and estimate fees using `WalletAccountBtc`. Uses Electrum servers for broadcasting.

```javascript
// Send Bitcoin (single recipient only)
const result = await account.sendTransaction({
  to: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', // Recipient's Bitcoin address
  value: 50000n, // Amount in satoshis
  feeRate: 10n, // Optional: fee rate in sat/vB (auto-estimated if not provided)
  confirmationTarget: 1 // Optional: target blocks for confirmation (default: 1)
})
console.log('Transaction hash:', result.hash)
console.log('Transaction fee:', result.fee, 'satoshis')

// Get transaction fee estimate
const quote = await account.quoteSendTransaction({
  to: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
  value: 50000n
})
console.log('Estimated fee:', quote.fee, 'satoshis')
```

**Important Notes:**
- Bitcoin transactions support **single recipient only** (no multiple recipients in one call)
- Fee rate is calculated automatically based on network conditions if not provided
- Transaction amounts and fees are always in **satoshis** (1 BTC = 100,000,000 satoshis)
- `sendTransaction()` returns `hash` and `fee` properties
- `quoteSendTransaction()` returns only the `fee` estimate

### Message Signing and Verification

Sign and verify messages using `WalletAccountBtc`.

```javascript
// Sign a message
const message = 'Hello, Bitcoin!'
const signature = await account.sign(message)
console.log('Signature:', signature)

// Verify a signature
const isValid = await account.verify(message, signature)
console.log('Signature valid:', isValid)
```

### Fee Management

Retrieve current fee rates using `WalletManagerBtc`. Rates are provided in satoshis per virtual byte (sat/vB).

```javascript
// Get current fee rates
const feeRates = await wallet.getFeeRates()
console.log('Normal fee rate:', feeRates.normal, 'sat/vB')  // Standard confirmation time (~1 hour)
console.log('Fast fee rate:', feeRates.fast, 'sat/vB')     // Faster confirmation time
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
account.dispose()

// Dispose entire wallet manager
wallet.dispose()
```

## 📚 API Reference

### Table of Contents

| Class | Description | Methods |
|-------|-------------|---------|
| [WalletManagerBtc](#walletmanagerbtc) | Main class for managing Bitcoin wallets. Extends `WalletManager` from `@tetherto/wdk-wallet`. | [Constructor](#constructor), [Methods](#methods) |
| [WalletAccountBtc](#walletaccountbtc) | Individual Bitcoin wallet account implementation. Extends `WalletAccountReadOnlyBtc` and implements `IWalletAccount` from `@tetherto/wdk-wallet`. | [Constructor](#constructor-1), [Methods](#methods-1), [Properties](#properties) |
| [WalletAccountReadOnlyBtc](#walletaccountreadonlybtc) | Read-only Bitcoin wallet account. Extends `WalletAccountReadOnly` from `@tetherto/wdk-wallet`. | [Constructor](#constructor-2), [Methods](#methods-2) |

### WalletManagerBtc

The main class for managing Bitcoin wallets.  
Extends `WalletManager` from `@tetherto/wdk-wallet`.

#### Constructor

```javascript
new WalletManagerBtc(seed, config)
```

**Parameters:**
- `seed` (string | Uint8Array): BIP-39 mnemonic seed phrase or seed bytes
- `config` (object, optional): Configuration object
  - `client` (IElectrumClient, optional): Electrum client instance (recommended). If provided, host/port/protocol are ignored.
  - `network` (string, optional): "bitcoin", "testnet", or "regtest" (default: "bitcoin")
  - `bip` (number, optional): BIP address type - 44 (legacy) or 84 (native SegWit) (default: 84)
  - `host` (string, optional): Electrum server hostname (default: "electrum.blockstream.info"). Ignored if client is provided.
  - `port` (number, optional): Electrum server port (default: 50001). Ignored if client is provided.
  - `protocol` (string, optional): Transport protocol - "tcp", "tls", "ssl", or "ws" (default: "tcp"). Ignored if client is provided.
  
**Example:**
```javascript
import { ElectrumTcp } from '@tetherto/wdk-wallet-btc'

const client = new ElectrumTcp({
  host: 'electrum.blockstream.info',
  port: 50001
})

const wallet = new WalletManagerBtc(seedPhrase, {
  client,
  network: 'bitcoin'
})
```

#### Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `getAccount(index)` | Returns a wallet account at the specified index | `Promise<WalletAccountBtc>` |
| `getAccountByPath(path)` | Returns a wallet account at the specified BIP-84 derivation path | `Promise<WalletAccountBtc>` |
| `getFeeRates()` | Returns current fee rates for transactions | `Promise<{normal: bigint, fast: bigint}>` |
| `dispose()` | Disposes all wallet accounts, clearing private keys from memory | `void` |

##### `getAccount(index)`
Returns a wallet account at the specified index using BIP-84 derivation.

**Parameters:**
- `index` (number, optional): The index of the account to get (default: 0)

**Returns:** `Promise<WalletAccountBtc>` - The wallet account

**Example:**
```javascript
// Returns the account with derivation path:
// For mainnet (bitcoin): m/84'/0'/0'/0/1
// For testnet or regtest: m/84'/1'/0'/0/1
const account = await wallet.getAccount(1)
```

##### `getAccountByPath(path)`
Returns a wallet account at the specified BIP-84 derivation path.

**Parameters:**
- `path` (string): The derivation path (e.g., "0'/0/0")

**Returns:** `Promise<WalletAccountBtc>` - The wallet account

**Example:**
```javascript
// Returns the account with derivation path:
// For mainnet (bitcoin): m/84'/0'/0'/0/1
// For testnet or regtest: m/84'/1'/0'/0/1
const account = await wallet.getAccountByPath("0'/0/1")
```

##### `getFeeRates()`
Returns current fee rates from mempool.space API.

**Returns:** `Promise<{normal: bigint, fast: bigint}>` - Object containing fee rates in sat/vB
- `normal`: Standard fee rate for confirmation within ~1 hour
- `fast`: Higher fee rate for faster confirmation

**Example:**
```javascript
const feeRates = await wallet.getFeeRates()
console.log('Normal fee rate:', feeRates.normal, 'sat/vB')
console.log('Fast fee rate:', feeRates.fast, 'sat/vB')
```

##### `dispose()`
Disposes all wallet accounts and clears sensitive data from memory.

**Returns:** `void`

**Example:**
```javascript
wallet.dispose()
```

### WalletAccountBtc

Represents an individual Bitcoin wallet account. Extends `WalletAccountReadOnlyBtc` and implements `IWalletAccount` from `@tetherto/wdk-wallet`.

#### Constructor

```javascript
new WalletAccountBtc(seed, path, config)
```

**Parameters:**
- `seed` (string | Uint8Array): BIP-39 mnemonic seed phrase or seed bytes
- `path` (string): Derivation path suffix (e.g., "0'/0/0")
- `config` (object, optional): Configuration object
  - `client` (IElectrumClient, optional): Electrum client instance (recommended). If provided, host/port/protocol are ignored.
  - `network` (string, optional): "bitcoin", "testnet", or "regtest" (default: "bitcoin")
  - `bip` (number, optional): BIP address type - 44 (legacy) or 84 (native SegWit) (default: 84)
  - `host` (string, optional): Electrum server hostname (default: "electrum.blockstream.info"). Ignored if client is provided.
  - `port` (number, optional): Electrum server port (default: 50001). Ignored if client is provided.
  - `protocol` (string, optional): Transport protocol - "tcp", "tls", "ssl", or "ws" (default: "tcp"). Ignored if client is provided.
#### Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `getAddress()` | Returns the account's Bitcoin address | `Promise<string>` |
| `getBalance()` | Returns the confirmed account balance in satoshis | `Promise<bigint>` |
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
const address = await account.getAddress()
console.log('Address:', address) // bc1q... (BIP-84) or 1... (BIP-44)
```

##### `getBalance()`
Returns the account's confirmed balance in satoshis.

**Returns:** `Promise<bigint>` - Balance in satoshis

**Example:**
```javascript
const balance = await account.getBalance()
console.log('Balance:', balance, 'satoshis')
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
  to: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
  value: 50000n
})
console.log('Transaction hash:', result.hash)
console.log('Fee:', result.fee, 'satoshis')
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
  to: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
  value: 50000n
})
console.log('Estimated fee:', quote.fee, 'satoshis')
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
  direction: 'incoming', 
  limit: 5 
})
console.log('Recent incoming transfers:', transfers)
```

##### `getTransactionReceipt(hash)`
Returns a transaction's receipt if it has been included in a block.

**Parameters:**
- `hash` (string): The transaction hash (64 hex characters)

**Returns:** `Promise<BtcTransaction | null>` - The transaction object, or null if not yet confirmed

**Example:**
```javascript
const receipt = await account.getTransactionReceipt('abc123...')
if (receipt) {
  console.log('Transaction confirmed')
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
const { amount, fee } = await account.getMaxSpendable()
console.log('Max spendable:', amount, 'satoshis')
console.log('Estimated fee:', fee, 'satoshis')
```

##### `sign(message)`
Signs a message using the account's private key.

**Parameters:**
- `message` (string): Message to sign

**Returns:** `Promise<string>` - Signature as base64 string

**Example:**
```javascript
const signature = await account.sign('Hello Bitcoin!')
console.log('Signature:', signature)
```

##### `verify(message, signature)`
Verifies a message signature using the account's public key.

**Parameters:**
- `message` (string): Original message
- `signature` (string): Signature as base64 string

**Returns:** `Promise<boolean>` - True if signature is valid

**Example:**
```javascript
const isValid = await account.verify('Hello Bitcoin!', signature)
console.log('Signature valid:', isValid)
```

##### `toReadOnlyAccount()`
Creates a read-only version of this account that can query balances but cannot sign transactions.

**Returns:** `Promise<WalletAccountReadOnlyBtc>` - The read-only account

**Example:**
```javascript
const readOnlyAccount = await account.toReadOnlyAccount()
const balance = await readOnlyAccount.getBalance()
```

##### `dispose()`
Disposes the wallet account, securely erasing the private key from memory and closing the Electrum connection.

**Returns:** `void`

**Example:**
```javascript
account.dispose()
// Private key is now securely wiped from memory
```

**Note**: `getTokenBalance()`, `transfer()`, and `quoteTransfer()` methods are not supported on the Bitcoin blockchain and will throw errors.

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `index` | `number` | The derivation path's index of this account |
| `path` | `string` | The full derivation path of this account |
| `keyPair` | `object` | The account's key pair (⚠️ Contains sensitive data) |

⚠️ **Security Note**: The `keyPair` property contains sensitive cryptographic material. Never log, display, or expose the private key.

### WalletAccountReadOnlyBtc

Represents a read-only Bitcoin wallet account. Extends `WalletAccountReadOnly` from `@tetherto/wdk-wallet`.

#### Constructor

```javascript
new WalletAccountReadOnlyBtc(address, config)
```

**Parameters:**
- `address` (string): The account's Bitcoin address
- `config` (object, optional): Configuration object
  - `client` (IElectrumClient, optional): Electrum client instance (if provided, host/port/protocol are ignored)
  - `host` (string, optional): Electrum server hostname (default: "electrum.blockstream.info")
  - `port` (number, optional): Electrum server port (default: 50001)
  - `protocol` (string, optional): Transport protocol - "tcp", "tls", or "ssl" (default: "tcp")
  - `network` (string, optional): "bitcoin", "testnet", or "regtest" (default: "bitcoin")

#### Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `getBalance()` | Returns the confirmed account balance in satoshis | `Promise<bigint>` |
| `quoteSendTransaction(options)` | Estimates the fee for a transaction | `Promise<{fee: bigint}>` |
| `getTransactionReceipt(hash)` | Returns a transaction's receipt | `Promise<BtcTransaction \| null>` |
| `getMaxSpendable()` | Returns the maximum spendable amount | `Promise<{amount: bigint, fee: bigint, changeValue: bigint}>` |

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