# @wdk/wallet-btc

A simple and secure package to manage BIP-84 (SegWit) wallets for the Bitcoin blockchain. This package provides a clean API for creating, managing, and interacting with Bitcoin wallets using BIP-39 seed phrases and Bitcoin-specific derivation paths.

## 🔍 About WDK

This module is part of the [**WDK (Wallet Development Kit)**](https://wallet.tether.io/) project, which empowers developers to build secure, non-custodial wallets with unified blockchain access, stateless architecture, and complete user control. 

For detailed documentation about the complete WDK ecosystem, visit [docs.wallet.tether.io](https://docs.wallet.tether.io).

## 🌟 Features

- **BIP-39 Seed Phrase Support**: Generate and validate BIP-39 mnemonic seed phrases
- **Bitcoin Derivation Paths**: Support for BIP-84 standard derivation paths for Bitcoin (m/84'/0')
- **Multi-Account Management**: Create and manage multiple accounts from a single seed phrase
- **Address Types Support**: Generate and manage Legacy, SegWit, and Native SegWit addresses
- **UTXO Management**: Track and manage unspent transaction outputs
- **Transaction Management**: Create, sign, and broadcast Bitcoin transactions
- **Fee Estimation**: Dynamic fee calculation with different priority levels
- **Electrum Support**: Connect to Electrum servers for network interaction
- **TypeScript Support**: Full TypeScript definitions included
- **Memory Safety**: Secure private key management with memory-safe implementation
- **Network Flexibility**: Support for both mainnet and testnet
- **Transaction Building**: Support for complex transaction construction with multiple inputs/outputs

## ⬇️ Installation

To install the `@wdk/wallet-btc` package, follow these instructions:

### Public Release

Once the package is publicly available, you can install it using npm:

```bash
npm install @wdk/wallet-btc
```

### Private Access

If you have access to the private repository, install the package from the develop branch on GitHub:

```bash
npm install git+https://github.com/tetherto/wdk-wallet-btc.git#develop
```

After installation, ensure your package.json includes the dependency correctly:

```json
"dependencies": {
  // ... other dependencies ...
  "@wdk/wallet-btc": "git+ssh://git@github.com:tetherto/wdk-wallet-btc.git#develop"
  // ... other dependencies ...
}
```

## 🚀 Quick Start

### Importing from `@wdk/wallet-btc`

1. **WalletManagerBtc**: Main class for managing Bitcoin wallets and multiple accounts
2. **WalletAccountBtc**: Class for individual Bitcoin wallet accounts with full transaction capabilities

**Note**: `ElectrumClient` is an internal class and not intended for direct use.

### Creating a New Wallet

```javascript
import WalletManagerBtc, { WalletAccountBtc } from '@wdk/wallet-btc'

// Use a BIP-39 seed phrase (replace with your own secure phrase)
const seedPhrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

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
import WalletManagerBtc from '@wdk/wallet-btc'

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
const customAccount = await wallet.getAccountByPath("0'/0/5")
const customAddress = await customAccount.getAddress()
console.log('Custom account address:', customAddress)

// All addresses are Native SegWit (bech32) format
// The wallet uses BIP-84 derivation paths and generates bech32 addresses only
console.log('Address format: Native SegWit (bech32)')
```

**Note**: This implementation generates Native SegWit (bech32) addresses only. Legacy and P2SH-wrapped SegWit address types are not supported. All accounts use BIP-84 derivation paths (m/84'/0'/account'/0/index).
### Checking Balances

#### Account Balance

```javascript
import WalletManagerBtc from '@wdk/wallet-btc'

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

// Get outgoing transfers only
const outgoingTransfers = await account.getTransfers({
  direction: 'outgoing',
  limit: 5
})
console.log('Outgoing transfers:', outgoingTransfers)

// Note: All balance and transfer queries require an active Electrum server connection
```

**Important Notes:**
- `getBalance()` returns confirmed balance only (no unconfirmed balance option)
- There's no direct UTXO access method - UTXOs are managed internally
- Use `getTransfers()` instead of `getTransactionHistory()` for transaction data
- Transfer objects include transaction ID, value, direction, fee, and block height information

### Transaction Management

```javascript
// Create and send a transaction (single recipient only)
const result = await account.sendTransaction({
  to: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', // Recipient's Bitcoin address
  value: 50000 // Amount in satoshis
})
console.log('Transaction hash:', result.hash)
console.log('Transaction fee:', result.fee, 'satoshis')

// Get transaction fee estimate
const quote = await account.quoteSendTransaction({
  to: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
  value: 50000
})
console.log('Estimated fee:', quote.fee, 'satoshis')

// Example with different amounts
const smallTransaction = await account.quoteSendTransaction({
  to: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
  value: 10000 // 0.0001 BTC
})
console.log('Small transaction fee:', smallTransaction.fee, 'satoshis')
```

**Important Notes:**
- Bitcoin transactions support **single recipient only** (no multiple recipients in one call)
- Fee rate is calculated automatically based on network conditions
- Transaction amounts and fees are always in **satoshis** (1 BTC = 100,000,000 satoshis)
- `sendTransaction()` returns `hash` and `fee` properties
- `quoteSendTransaction()` returns only the `fee` estimate

### Fee Management

Retrieve current fee rates using `WalletManagerBtc`. Rates are provided in satoshis per virtual byte (sat/vB).

```javascript
// Get current fee rates
const feeRates = await wallet.getFeeRates();
console.log('Normal fee rate:', feeRates.normal, 'sat/vB');  // Standard confirmation time (~1 hour)
console.log('Fast fee rate:', feeRates.fast, 'sat/vB');     // Faster confirmation time

// Estimate transaction fee using quoteSendTransaction
const feeEstimate = await account.quoteSendTransaction({
  to: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
  value: 50000 // Amount in satoshis
})
console.log('Estimated fee:', feeEstimate.fee, 'satoshis')

// Example: Compare fees for different transaction amounts
const smallTxFee = await account.quoteSendTransaction({
  to: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
  value: 10000 // 0.0001 BTC
})

const largeTxFee = await account.quoteSendTransaction({
  to: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
  value: 1000000 // 0.01 BTC
})

console.log('Small transaction fee:', smallTxFee.fee, 'satoshis')
console.log('Large transaction fee:', largeTxFee.fee, 'satoshis')
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

// Close Electrum client connection
```
## 📚 API Reference

### Table of Contents

| Class | Description | Methods |
|-------|-------------|---------|
| [WalletManagerBtc](#walletmanagerbtc) | Main class for managing Bitcoin wallets. Extends `WalletManager` from `@wdk/wallet`. | [Constructor](#constructor), [Methods](#methods) |
| [WalletAccountBtc](#walletaccountbtc) | Individual Bitcoin wallet account implementation. Implements `IWalletAccount`. | [Constructor](#constructor-1), [Methods](#methods-1), [Properties](#properties) |

### WalletManagerBtc

The main class for managing Bitcoin wallets.  
Extends `WalletManager` from `@wdk/wallet`.

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

Represents an individual Bitcoin wallet account. Implements `IWalletAccount` from `@wdk/wallet`.

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
| `getBalance()` | Returns the confirmed account balance in satoshis | `Promise<number>` |
| `sendTransaction(options)` | Sends a Bitcoin transaction | `Promise<{hash: string, fee: number}>` |
| `quoteSendTransaction(options)` | Estimates the fee for a transaction | `Promise<{fee: number}>` |
| `getTransfers(options?)` | Returns the account's transfer history | `Promise<BtcTransfer[]>` |
| `sign(message)` | Signs a message with the account's private key | `Promise<string>` |
| `verify(message, signature)` | Verifies a message signature | `Promise<boolean>` |
| `toReadOnlyAccount()` | Creates a read-only version of this account | `Promise<WalletAccountReadOnlyBtc>` |
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
  - `value` (number): Amount in satoshis

**Returns:** `Promise<{hash: string, fee: number}>`
- `hash`: Transaction hash
- `fee`: Transaction fee in satoshis

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
  - `value` (number): Amount in satoshis

**Returns:** `Promise<{fee: number}>`
- `fee`: Estimated transaction fee in satoshis

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
- `txid`: Transaction ID
- `address`: Account's own address
- `vout`: Output index in the transaction
- `height`: Block height (0 if unconfirmed)
- `value`: Transfer value in satoshis
- `direction`: 'incoming' or 'outgoing'
- `fee`: Transaction fee in satoshis (for outgoing transfers)
- `recipient`: Receiving address (for outgoing transfers)

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

##### `getTokenBalance(tokenAddress)`
Not supported on the Bitcoin blockchain. Always throws an error.

**Parameters:**
- `tokenAddress` (string): Token contract address

**Throws:** Error - "The 'getTokenBalance' method is not supported on the bitcoin blockchain."

**Example:**
```javascript
// This will throw an error
try {
  await account.getTokenBalance('some-address')
} catch (error) {
  console.log(error.message) // Not supported on bitcoin blockchain
}
```

##### `transfer(options)`
Not supported on the Bitcoin blockchain. Always throws an error.

**Parameters:**
- `options` (object): Transfer options

**Throws:** Error - "The 'transfer' method is not supported on the bitcoin blockchain."

##### `quoteTransfer(options)`
Not supported on the Bitcoin blockchain. Always throws an error.

**Parameters:**
- `options` (object): Transfer options

**Throws:** Error - "The 'quoteTransfer' method is not supported on the bitcoin blockchain."

##### `toReadOnlyAccount()`
Creates a read-only version of this account that can query balances and transactions but cannot sign or send transactions.

**Returns:** `Promise<WalletAccountReadOnlyBtc>` - Read-only account instance

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

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `index` | `number` | The derivation path's index of this account |
| `path` | `string` | The full BIP-84 derivation path of this account |
| `keyPair` | `KeyPair` | The account's public and private key pair |

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

#### Configuration Examples:

```javascript
// Mainnet with custom server
const wallet = new WalletManagerBtc(seedPhrase, {
  host: 'your-fulcrum-server.com',
  port: 50001,
  network: 'bitcoin'
})

// Testnet
const testnetWallet = new WalletManagerBtc(seedPhrase, {
  host: 'your-testnet-server.com',
  port: 50001,
  network: 'testnet'
})
```

**Performance Note**: Public Electrum servers may be 10-300x slower and can fail for addresses with many transactions. Always use your own infrastructure for production applications.

**Block Explorers:**
- Mainnet: https://blockstream.info
- Testnet: https://blockstream.info/testnet

### Supported Address Types

This implementation supports **Native SegWit (P2WPKH) addresses only**:

- **Native SegWit (P2WPKH)**: Addresses starting with 'bc1' (mainnet) or 'tb1' (testnet)
  - Uses BIP-84 derivation paths (`m/84'/0'/account'/0/index`)
  - Lower transaction fees compared to legacy formats
  - Full SegWit benefits including transaction malleability protection

**Note**: Legacy (P2PKH) and wrapped SegWit (P2SH-P2WPKH) address types are not supported by this implementation. All generated addresses use the Native SegWit format for optimal fee efficiency and modern Bitcoin standards.

## 🔒 Security Considerations

- **Seed Phrase Security**: 
  - Always store your seed phrase securely and never share it
  - Use strong entropy for seed generation
  - Keep backups in secure, offline locations

- **Private Key Management**: 
  - The package handles private keys internally with memory safety features using `sodium_memzero`
  - Keys are never stored on disk
  - Keys are securely cleared from memory when `dispose()` is called
  - Private keys are wiped during cryptographic operations for additional security

- **Network Security**: 
  - Use trusted Electrum servers or run your own for production
  - Default connection uses TCP (not SSL) - configure SSL separately if needed
  - Be aware of potential network analysis risks when using public servers
  - Consider using `fulcrum.frznode.com` or similar alternatives for better performance

- **Transaction Validation**:
  - Always verify recipient addresses before sending
  - Double-check transaction amounts and fees
  - Wait for appropriate confirmation count based on transaction value
  - All transactions use Native SegWit format for optimal fee efficiency

- **UTXO Management**:
  - UTXO selection and change handling is managed automatically by the wallet
  - Dust limit is enforced (546 satoshis minimum)
  - No public API for manual UTXO selection or consolidation
  - Privacy implications of UTXO usage are handled internally

- **Fee Management**: 
  - Fee rates are fetched from mempool.space API automatically
  - Set appropriate priority using `normal` or `fast` fee rates
  - No manual RBF (Replace-By-Fee) support - transactions are final once broadcast
  - Fee estimation includes automatic UTXO selection

- **Address Format**:
  - Only Native SegWit (bech32) addresses are supported
  - All addresses start with 'bc1' (mainnet) or 'tb1' (testnet)
  - Uses BIP-84 derivation paths for optimal compatibility
  - Lower fees compared to legacy address formats

- **Memory Management**:
  - Always call `dispose()` on accounts and wallets when finished
  - Automatic memory cleanup during key derivation operations
  - Electrum connections are properly closed on disposal

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
## 💡 Examples

### Complete Wallet Setup

```javascript
import WalletManagerBtc from '@wdk/wallet-btc'

async function setupWallet() {
  // Use a BIP-39 seed phrase (replace with your own secure phrase)
  const seedPhrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
  
  // Create wallet manager with correct configuration
  const wallet = new WalletManagerBtc(seedPhrase, {
    host: 'your-electrum-server.com', // Replace with your preferred server
    port: 50001,
    network: 'bitcoin' // 'bitcoin', 'testnet', or 'regtest'
  })
  
  // Get first account
  const account = await wallet.getAccount(0)
  
  // Get Native SegWit address (only supported format)
  const address = await account.getAddress()
  console.log('Native SegWit address:', address) // bc1...
  
  // Check confirmed balance
  const balance = await account.getBalance()
  console.log('Balance:', balance, 'satoshis')
  
  // Get fee rates
  const feeRates = await wallet.getFeeRates()
  console.log('Fee rates:', feeRates) // { normal: X, fast: Y }
  
  return { wallet, account, address, balance, feeRates }
}
```

### Transaction Management

```javascript
async function sendBitcoin(account) {
  // Estimate transaction fee first
  const quote = await account.quoteSendTransaction({
    to: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    value: 50000 // Amount in satoshis
  })
  console.log('Estimated fee:', quote.fee, 'satoshis')

  // Send the transaction (single recipient only)
  const result = await account.sendTransaction({
    to: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    value: 50000 // Amount in satoshis
  })
  
  console.log('Transaction hash:', result.hash)
  console.log('Actual fee:', result.fee, 'satoshis')
  
  return result
}

async function getTransactionHistory(account) {
  // Get recent transfers
  const transfers = await account.getTransfers({
    direction: 'all', // 'incoming', 'outgoing', or 'all'
    limit: 10,
    skip: 0
  })
  
  console.log('Recent transfers:', transfers)
  return transfers
}

async function manageMultipleAccounts(wallet) {
  // Get multiple accounts from same seed
  const account0 = await wallet.getAccount(0)
  const account1 = await wallet.getAccount(1)
  
  // Or use custom derivation paths
  const customAccount = await wallet.getAccountByPath("0'/0/5")
  
  const accounts = [account0, account1, customAccount]
  
  // Check balances for all accounts
  for (let i = 0; i < accounts.length; i++) {
    const balance = await accounts[i].getBalance()
    const address = await accounts[i].getAddress()
    console.log(`Account ${i}: ${address} - ${balance} satoshis`)
  }
  
  return accounts
}
```

### Memory Management

```javascript
async function secureCleanup(wallet, accounts) {
  // Dispose individual accounts
  for (const account of accounts) {
    account.dispose() // Clears private keys from memory
  }
  
  // Dispose entire wallet (disposes all accounts)
  wallet.dispose()
  
  console.log('All private keys cleared from memory')
}
```

## 📜 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 🆘 Support

For support, please open an issue on the GitHub repository.

---

**Note**: This package is currently in beta. Please test thoroughly in development environments before using in production.