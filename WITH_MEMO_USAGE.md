# Transaction Memo Functions Usage Guide

This guide describes how to use the memo-related functions in `@tetherto/wdk-wallet-btc` to embed arbitrary data in Bitcoin transactions using OP_RETURN outputs.

## Overview

The memo functions allow you to attach a small text message (memo) to Bitcoin transactions. The memo is embedded in an OP_RETURN output, which makes the data provably unspendable and permanently recorded on the blockchain. This is useful for:

- Adding transaction notes or references
- Embedding metadata or transaction IDs from other systems
- Creating on-chain records for compliance or accounting purposes
- Attaching messages to payments

**Important Requirements:**
- **Taproot Addresses Only**: All memo functions require the recipient address to be a Taproot (P2TR) address
  - Mainnet: addresses starting with `bc1p`
  - Testnet: addresses starting with `tb1p`
  - Regtest: addresses starting with `bcrt1p`
- **Memo Size Limit**: Memos cannot exceed 75 bytes when UTF-8 encoded
- **Fee Calculation**: OP_RETURN outputs add to transaction size, so fees are automatically adjusted to account for the additional output

## Available Functions

### 1. `quoteSendTransactionWithMemo`

Quotes the transaction fee for sending Bitcoin with a memo, without actually building or broadcasting the transaction.

**Location**: `WalletAccountReadOnlyBtc` (available on both read-only and full accounts)

**Signature**:
```typescript
quoteSendTransactionWithMemo({
  to: string,
  value: number | bigint,
  memo: string,
  feeRate?: number | bigint,
  confirmationTarget?: number
}): Promise<{ fee: bigint }>
```

**Parameters**:
- `to` (required): The recipient's Taproot Bitcoin address (must start with `bc1p`, `tb1p`, or `bcrt1p`)
- `value` (required): The amount to send in satoshis
- `memo` (required): The memo string to embed (max 75 bytes UTF-8)
- `feeRate` (optional): Fee rate in satoshis per virtual byte. If not provided, estimated from network
- `confirmationTarget` (optional): Confirmation target in blocks (default: 1)

**Returns**: `Promise<{ fee: bigint }>` - Object containing the estimated fee in satoshis

**Example**:
```javascript
import WalletManagerBtc from '@tetherto/wdk-wallet-btc'

const wallet = new WalletManagerBtc(seedPhrase, {
  host: 'electrum.blockstream.info',
  port: 50001,
  network: 'testnet'
})

const account = await wallet.getAccount(0)

// Quote a transaction with memo
try {
  const quote = await account.quoteSendTransactionWithMemo({
    to: 'tb1p...', // Taproot testnet address
    value: 10000, // 0.0001 BTC
    memo: 'Payment for invoice #12345',
    confirmationTarget: 1
  })
  
  console.log('Estimated fee:', quote.fee.toString(), 'satoshis')
} catch (error) {
  console.error('Error:', error.message)
}
```

### 2. `sendTransactionWithMemo`

Sends a Bitcoin transaction with a memo attached. This function builds, signs, and broadcasts the transaction.

**Location**: `WalletAccountBtc` (full account only, requires private key)

**Signature**:
```typescript
sendTransactionWithMemo({
  to: string,
  value: number | bigint,
  memo: string,
  feeRate?: number | bigint,
  confirmationTarget?: number
}): Promise<{ hash: string, fee: bigint }>
```

**Parameters**: Same as `quoteSendTransactionWithMemo`

**Returns**: `Promise<{ hash: string, fee: bigint }>` - Object containing:
- `hash`: The transaction ID (txid)
- `fee`: The actual fee paid in satoshis

**Example**:
```javascript
import WalletManagerBtc from '@tetherto/wdk-wallet-btc'

const wallet = new WalletManagerBtc(seedPhrase, {
  host: 'electrum.blockstream.info',
  port: 50001,
  network: 'testnet'
})

const account = await wallet.getAccount(0)

// Send transaction with memo
try {
  const result = await account.sendTransactionWithMemo({
    to: 'tb1p...', // Taproot testnet address
    value: 10000, // 0.0001 BTC
    memo: 'Payment for invoice #12345',
    feeRate: 10 // 10 sat/vB (optional)
  })
  
  console.log('Transaction hash:', result.hash)
  console.log('Fee paid:', result.fee.toString(), 'satoshis')
  
  // Wait for confirmation
  const receipt = await account.getTransactionReceipt(result.hash)
  if (receipt) {
    console.log('Transaction confirmed!')
  }
} catch (error) {
  console.error('Error:', error.message)
}
```

### 3. `quoteSendTransactionWithMemoTX`

Builds and signs a transaction with a memo, returning the raw hexadecimal string without broadcasting it. Useful for inspecting the transaction or broadcasting it manually later.

**Location**: `WalletAccountBtc` (full account only, requires private key)

**Signature**:
```typescript
quoteSendTransactionWithMemoTX({
  to: string,
  value: number | bigint,
  memo: string,
  feeRate?: number | bigint,
  confirmationTarget?: number
}): Promise<string>
```

**Parameters**: Same as `quoteSendTransactionWithMemo`

**Returns**: `Promise<string>` - The raw hexadecimal string of the signed transaction

**Example**:
```javascript
import WalletManagerBtc from '@tetherto/wdk-wallet-btc'

const wallet = new WalletManagerBtc(seedPhrase, {
  host: 'electrum.blockstream.info',
  port: 50001,
  network: 'testnet'
})

const account = await wallet.getAccount(0)

// Get raw transaction hex
try {
  const txHex = await account.quoteSendTransactionWithMemoTX({
    to: 'tb1p...', // Taproot testnet address
    value: 10000, // 0.0001 BTC
    memo: 'Payment for invoice #12345'
  })
  
  console.log('Transaction hex:', txHex)
  
  // You can inspect the transaction or broadcast it manually
  // For example, using bitcoin-cli:
  // bitcoin-cli sendrawtransaction <txHex>
  
  // Or broadcast using Electrum client:
  // await account._electrumClient.blockchainTransaction_broadcast(txHex)
} catch (error) {
  console.error('Error:', error.message)
}
```

## Complete Example: Workflow with Memo Functions

Here's a complete example showing how to use all three functions together:

```javascript
import WalletManagerBtc from '@tetherto/wdk-wallet-btc'

async function sendPaymentWithMemo() {
  const wallet = new WalletManagerBtc(seedPhrase, {
    host: 'electrum.blockstream.info',
    port: 50001,
    network: 'testnet'
  })

  const account = await wallet.getAccount(0)
  const recipientAddress = 'tb1p...' // Taproot testnet address
  const amount = 10000 // 0.0001 BTC
  const memo = 'Invoice #12345 - Payment for services'

  try {
    // Step 1: Quote the transaction to check fees
    const quote = await account.quoteSendTransactionWithMemo({
      to: recipientAddress,
      value: amount,
      memo: memo
    })
    
    console.log('Estimated fee:', quote.fee.toString(), 'satoshis')
    
    // Step 2: Optionally get the raw transaction hex for inspection
    const txHex = await account.quoteSendTransactionWithMemoTX({
      to: recipientAddress,
      value: amount,
      memo: memo
    })
    
    console.log('Transaction hex:', txHex)
    
    // Step 3: Send the transaction
    const result = await account.sendTransactionWithMemo({
      to: recipientAddress,
      value: amount,
      memo: memo
    })
    
    console.log('Transaction sent!')
    console.log('Transaction ID:', result.hash)
    console.log('Fee paid:', result.fee.toString(), 'satoshis')
    
    // Step 4: Wait for confirmation
    let receipt = null
    while (!receipt) {
      await new Promise(resolve => setTimeout(resolve, 5000)) // Wait 5 seconds
      receipt = await account.getTransactionReceipt(result.hash)
    }
    
    console.log('Transaction confirmed!')
    
  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    account.dispose()
    wallet.dispose()
  }
}

sendPaymentWithMemo()
```

## Error Handling

All memo functions will throw errors in the following cases:

1. **Invalid Taproot Address**: If the recipient address is not a Taproot address
   ```javascript
   // Error: Recipient address must be a Taproot (P2TR) address. 
   // Taproot addresses start with bc1p (mainnet), tb1p (testnet), or bcrt1p (regtest).
   ```

2. **Memo Too Large**: If the memo exceeds 75 bytes when UTF-8 encoded
   ```javascript
   // Error: Memo cannot exceed 75 bytes when UTF-8 encoded.
   ```

3. **Insufficient Balance**: If there are not enough funds to cover the transaction and fees
   ```javascript
   // Error: Insufficient balance to send the transaction.
   // or
   // Error: Insufficient balance after fees (including OP_RETURN output).
   ```

4. **No UTXOs Available**: If there are no unspent outputs available
   ```javascript
   // Error: No unspent outputs available.
   ```

## Best Practices

1. **Check Memo Size**: Always validate memo size before calling the functions:
   ```javascript
   const memo = 'Your memo text'
   const memoSize = Buffer.from(memo, 'utf8').length
   if (memoSize > 75) {
     throw new Error('Memo exceeds 75 bytes')
   }
   ```

2. **Quote Before Sending**: Always use `quoteSendTransactionWithMemo` to check fees before sending:
   ```javascript
   const quote = await account.quoteSendTransactionWithMemo({ to, value, memo })
   console.log('Fee will be:', quote.fee.toString(), 'satoshis')
   // Proceed with sendTransactionWithMemo if fee is acceptable
   ```

3. **Handle Errors Gracefully**: Wrap calls in try-catch blocks to handle errors:
   ```javascript
   try {
     const result = await account.sendTransactionWithMemo({ to, value, memo })
     // Handle success
   } catch (error) {
     if (error.message.includes('Taproot')) {
       // Handle invalid address
     } else if (error.message.includes('75 bytes')) {
       // Handle memo too large
     } else {
       // Handle other errors
     }
   }
   ```

4. **Use Appropriate Networks**: Use testnet for development and testing:
   ```javascript
   const wallet = new WalletManagerBtc(seedPhrase, {
     network: 'testnet' // Use 'bitcoin' for mainnet
   })
   ```

5. **Dispose Resources**: Always dispose of accounts and wallets when done:
   ```javascript
   account.dispose()
   wallet.dispose()
   ```

## Technical Details

### OP_RETURN Outputs

OP_RETURN outputs are special Bitcoin script outputs that:
- Have a value of 0 satoshis (they are provably unspendable)
- Can contain up to 75 bytes of arbitrary data
- Are permanently recorded on the blockchain
- Add to transaction size and thus affect fees

### Fee Calculation

The memo functions automatically account for the OP_RETURN output size when calculating fees:
- Base transaction fee is calculated using `coinselect`
- Additional fee for OP_RETURN output is calculated as: `(OP_RETURN size in bytes) × feeRate`
- Total fee = base fee + OP_RETURN fee

The OP_RETURN output size is: `1 byte (OP_RETURN) + 1 byte (push opcode) + memo length in bytes`

### Taproot Address Format

Taproot addresses use Bech32m encoding and have the following prefixes:
- **Mainnet**: `bc1p` (followed by 58 characters)
- **Testnet**: `tb1p` (followed by 58 characters)
- **Regtest**: `bcrt1p` (followed by 58 characters)

Example Taproot addresses:
- Mainnet: `bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac36sfj9hgpvq8rv7d`
- Testnet: `tb1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac36sfj9hgpvq8rv7d`

## See Also

- [README.md](./README.md) - Main package documentation
- [BIP-86 (Taproot)](https://github.com/bitcoin/bips/blob/master/bip-0086.mediawiki) - Taproot derivation path specification
- [BIP-340 (Schnorr Signatures)](https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki) - Schnorr signature specification
- [OP_RETURN Documentation](https://en.bitcoin.it/wiki/OP_RETURN) - Bitcoin OP_RETURN opcode documentation

