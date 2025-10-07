# @tetherto/wdk-wallet-btc

**Note**: This package is currently in beta. Please test thoroughly in development environments before using in production.

A simple and secure package to manage BIP-84 (SegWit) wallets for the Bitcoin blockchain. This package provides a clean API for creating, managing, and interacting with Bitcoin wallets using BIP-39 seed phrases and Bitcoin-specific derivation paths.

## 🔍 About WDK

This module is part of the [**WDK (Wallet Development Kit)**](https://wallet.tether.io/) project, which empowers developers to build secure, non-custodial wallets with unified blockchain access, stateless architecture, and complete user control. 

For detailed documentation about the complete WDK ecosystem, visit [docs.wallet.tether.io](https://docs.wallet.tether.io).

## 🌟 Features

- **Bitcoin Derivation Paths**: Support for BIP-84 standard derivation paths for Bitcoin (m/84'/0')
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
import WalletManagerBtc, { WalletAccountBtc } from '@tetherto/wdk-wallet-btc'

// Use a BIP-39 seed phrase (replace with your own secure phrase)
const seedPhrase = 'test only example nut use this real life secret phrase must random'

// Create wallet manager with Electrum server config
const wallet = new WalletManagerBtc(seedPhrase, {
  host: 'electrum.blockstream.info', // Electrum server hostname
  port: 50001, // Electrum server port (50001 for TCP, 50002 for SSL)
  network: 'bitcoin' // 'bitcoin', 'testnet', or 'regtest'
})

// Get a full access account (uses BIP-84 derivation path)
const account = await wallet.getAccount(0)

// Get the account's address (Native SegWit by default)
const address = await account.getAddress()
console.log('Account address:', address)
```

**Note**: This implementation uses BIP-84 derivation paths and generates Native SegWit (bech32) addresses by default. The address type is determined by the BIP-84 standard, not by configuration.

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
// Full path will be m/84'/0'/0'/0/5
const customAccount = await wallet.getAccountByPath("0'/0/5")
const customAddress = await customAccount.getAddress()
console.log('Custom account address:', customAddress)

// Note: All addresses are Native SegWit (bech32) addresses (bc1...)
// All accounts inherit the provider configuration from the wallet manager
```

**Note**: This implementation generates Native SegWit (bech32) addresses only. Legacy and P2SH-wrapped SegWit address types are not supported. All accounts use BIP-84 derivation paths (m/84'/0'/account'/0/index).

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
  value: 50000n // Amount in satoshis
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
- Fee rate is calculated automatically based on network conditions
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
const feeRates = await wallet.getFeeRates();
console.log('Normal fee rate:', feeRates.normal, 'sat/vB');  // Standard confirmation time (~1 hour)
console.log('Fast fee rate:', feeRates.fast, 'sat/vB');     // Faster confirmation time
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
| [WalletAccountBtc](#walletaccountbtc) | Individual Bitcoin wallet account implementation. Implements `IWalletAccount` from `@tetherto/wdk-wallet`. | [Constructor](#constructor-1), [Methods](#methods-1), [Properties](#properties) |

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
  - `host` (string, optional): Electrum server hostname (default: "electrum.blockstream.info")
  - `port` (number, optional): Electrum server port (default: 50001)
  - `network` (string, optional): "bitcoin", "testnet", or "regtest" (default: "bitcoin")

**Example:**
```javascript
const wallet = new WalletManagerBtc(seedPhrase, {
  host: 'electrum.blockstream.info',
  port: 50001,
  network: 'bitcoin'
})
```

#### Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `getAccount(index)` | Returns a wallet account at the specified index | `Promise<WalletAccountBtc>` |
| `getAccountByPath(path)` | Returns a wallet account at the specified BIP-84 derivation path | `Promise<WalletAccountBtc>` |
| `getFeeRates()` | Returns current fee rates for transactions | `Promise<{normal: number, fast: number}>` |
| `dispose()` | Disposes all wallet accounts, clearing private keys from memory | `void` |

##### `getAccount(index)`
Returns a wallet account at the specified index using BIP-84 derivation.

**Parameters:**
- `index` (number, optional): The index of the account to get (default: 0)

**Returns:** `Promise<WalletAccountBtc>` - The wallet account

**Example:**
```javascript
const account = await wallet.getAccount(0)
```

##### `getAccountByPath(path)`
Returns a wallet account at the specified BIP-84 derivation path.

**Parameters:**
- `path` (string): The derivation path (e.g., "0'/0/0")

**Returns:** `Promise<WalletAccountBtc>` - The wallet account

**Example:**
```javascript
const account = await wallet.getAccountByPath("0'/0/1")
```

##### `getFeeRates()`
Returns current fee rates from mempool.space API.

**Returns:** `Promise<{normal: number, fast: number}>` - Object containing fee rates in sat/vB
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

Represents an individual Bitcoin wallet account. Implements `IWalletAccount` from `@tetherto/wdk-wallet`.

#### Constructor

```javascript
new WalletAccountBtc(seed, path, config)
```

**Parameters:**
- `seed` (string | Uint8Array): BIP-39 mnemonic seed phrase or seed bytes
- `path` (string): BIP-84 derivation path (e.g., "0'/0/0")
- `config` (object, optional): Configuration object
  - `host` (string, optional): Electrum server hostname (default: "electrum.blockstream.info")
  - `port` (number, optional): Electrum server port (default: 50001)
  - `network` (string, optional): "bitcoin", "testnet", or "regtest" (default: "bitcoin")

#### Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `getAddress()` | Returns the account's Native SegWit address | `Promise<string>` |
| `getBalance()` | Returns the confirmed account balance in satoshis | `Promise<bigint>` |
| `sendTransaction(options)` | Sends a Bitcoin transaction | `Promise<{hash: string, fee: bigint}>` |
| `quoteSendTransaction(options)` | Estimates the fee for a transaction | `Promise<{fee: bigint}>` |
| `getTransfers(options?)` | Returns the account's transfer history | `Promise<BtcTransfer[]>` |
| `sign(message)` | Signs a message with the account's private key | `Promise<string>` |
| `verify(message, signature)` | Verifies a message signature | `Promise<boolean>` |
| `toReadOnlyAccount()` | Creates a read-only version of this account | `Promise<never>` |
| `dispose()` | Disposes the wallet account, clearing private keys from memory | `void` |

##### `getAddress()`
Returns the account's Native SegWit (bech32) address.

**Returns:** `Promise<string>` - The Bitcoin address

**Example:**
```javascript
const address = await account.getAddress()
console.log('Address:', address) // bc1q...
```

##### `getBalance()`
Returns the account's confirmed balance in satoshis.

**Returns:** `Promise<number>` - Balance in satoshis

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

**Returns:** `Promise<{hash: string, fee: number}>` - Object containing hash and fee (in satoshis)

**Example:**
```javascript
const result = await account.sendTransaction({
  to: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
  value: 50000
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

**Returns:** `Promise<{fee: number}>` - Object containing estimated fee (in satoshis)

**Example:**
```javascript
const quote = await account.quoteSendTransaction({
  to: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
  value: 50000
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

##### `sign(message)`
Signs a message using the account's private key.

**Parameters:**
- `message` (string): Message to sign

**Returns:** `Promise<string>` - Signature as hex string

**Example:**
```javascript
const signature = await account.sign('Hello Bitcoin!')
console.log('Signature:', signature)
```

##### `verify(message, signature)`
Verifies a message signature using the account's public key.

**Parameters:**
- `message` (string): Original message
- `signature` (string): Signature as hex string

**Returns:** `Promise<boolean>` - True if signature is valid

**Example:**
```javascript
const isValid = await account.verify('Hello Bitcoin!', signature)
console.log('Signature valid:', isValid)
```

##### `toReadOnlyAccount()`
Creates a read-only version of this account (not supported on Bitcoin blockchain).

**Returns:** `Promise<never>` - Always throws an error

**Throws:** Error - "Read-only accounts are not supported for the bitcoin blockchain."

**Example:**
```javascript
// This will throw an error
try {
  await account.toReadOnlyAccount()
} catch (error) {
  console.log(error.message) // Read-only accounts are not supported
}
```

##### `dispose()`
Disposes the wallet account, securely erasing the private key from memory.

**Returns:** `void`

**Example:**
```javascript
account.dispose()
// Private key is now securely wiped from memory
```

**Note**: `getTokenBalance()`, `transfer()`, `quoteTransfer()`, and `toReadOnlyAccount()` methods are not supported on the Bitcoin blockchain and will throw errors.

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `index` | `number` | The derivation path's index of this account |
| `path` | `string` | The full BIP-84 derivation path of this account |
| `keyPair` | `object` | The account's key pair (⚠️ Contains sensitive data) |

⚠️ **Security Note**: The `keyPair` property contains sensitive cryptographic material. Never log, display, or expose the private key.

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

This implementation supports **Native SegWit (P2WPKH) addresses only**:

- **Native SegWit (P2WPKH)**: Addresses starting with 'bc1' (mainnet) or 'tb1' (testnet)
  - Uses BIP-84 derivation paths (`m/84'/0'/account'/0/index`)
  - Lower transaction fees compared to legacy formats
  - Full SegWit benefits including transaction malleability protection

**Note**: Legacy (P2PKH) and wrapped SegWit (P2SH-P2WPKH) address types are not supported by this implementation. All generated addresses use the Native SegWit format for optimal fee efficiency and modern Bitcoin standards.

## 🔒 Security Considerations

- **Seed Phrase Security**: Always store your seed phrase securely and never share it
- **Private Key Management**: The package handles private keys internally with memory safety features
- **Network Security**: Use trusted Electrum servers or run your own for production
- **Transaction Validation**: Always verify recipient addresses before sending
- **Memory Cleanup**: Use the `dispose()` method to clear private keys from memory when done
- **UTXO Management**: UTXO selection and change handling is managed automatically by the wallet
- **Fee Management**: Fee rates are fetched from mempool.space API automatically
- **Address Format**: Only Native SegWit (bech32) addresses are supported

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
