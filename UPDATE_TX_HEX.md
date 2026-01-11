# Transaction Update with Hex Data Usage Guide

This guide describes how to use the transaction update functions in `@tetherto/wdk-wallet-btc` to create transactions that update prior transactions by spending a specific UTXO and embedding hex-encoded data in an OP_RETURN output.

## Overview

The transaction update functions allow you to create transactions that:
- Spends a specific UTXO from a prior transaction (with value 1007 sats)
- Funds the transaction with additional UTXOs from your account
- Sends 1007 sats to a recipient address
- Embeds hex-encoded data in an OP_RETURN output
- Returns change to your account

This is useful for:
- Updating on-chain records by referencing prior transactions
- Creating transaction chains that link related operations
- Embedding binary data or encoded metadata in transactions
- Building applications that require transaction references

**Important Requirements:**
- **Prior Transaction UTXO**: The prior transaction must contain an output with exactly 1007 sats
- **Prior Account**: The `priorAcct` parameter must be provided - this is the account that owns the priorTx UTXO and will sign that input
- **UTXO Ownership**: The prior transaction UTXO must belong to the `priorAcct` account (same address script) to be signable
- **Network Matching**: The `priorAcct` must be on the same network as the current account
- **Hex Data Size Limit**: Hex data cannot exceed 75 bytes when decoded (150 hex characters max)
- **Default Value**: If `value` is not provided, it defaults to 1007 sats
- **Transaction Structure**: The function creates a transaction with exactly 2 inputs and 3 outputs

## Function Details

### `quoteUpdateTransactionWithHexTX`

Builds and signs a transaction that updates a prior transaction by spending a specific UTXO and embedding hex-encoded data. Returns the raw hexadecimal string without broadcasting it.

**Location**: `WalletAccountBtc` (full account only, requires private key)

**Signature**:
```typescript
quoteUpdateTransactionWithHexTX({
  to: string,
  hex: string,
  priorTx: string,
  priorAcct: WalletAccountBtc,
  value?: number | bigint,
  feeRate?: number | bigint,
  confirmationTarget?: number
}): Promise<string>
```

**Parameters**:
- `to` (required): The recipient's Bitcoin address
- `hex` (required): The hex-encoded data string to embed in OP_RETURN (max 75 bytes when decoded, 150 hex characters)
- `priorTx` (required): The transaction ID (txid) of the prior transaction containing the UTXO to spend
- `priorAcct` (required): The `WalletAccountBtc` account instance that owns the priorTx UTXO. This account will sign the first input.
- `value` (optional): The amount to send in satoshis (default: 1007)
- `feeRate` (optional): Fee rate in satoshis per virtual byte. If not provided, estimated from network
- `confirmationTarget` (optional): Confirmation target in blocks (default: 1)

**Returns**: `Promise<string>` - The raw hexadecimal string of the signed transaction

**Transaction Structure**:

**Inputs** (2 total):
1. UTXO from `priorTx` with value of 1007 sats (signed by `priorAcct`)
2. UTXO from main account to fund the transaction (signed by this account)

**Outputs** (3 total, in order):
1. Payment output: 1007 sats sent to `to` address
2. OP_RETURN output: Contains the hex-encoded data (0 sats)
3. Change output: Remaining funds returned to your account

### `updateTransactionWithHex`

Sends a transaction that updates a prior transaction by spending a specific UTXO and embedding hex-encoded data. This function builds, signs, and broadcasts the transaction.

**Location**: `WalletAccountBtc` (full account only, requires private key)

**Signature**:
```typescript
updateTransactionWithHex({
  to: string,
  hex: string,
  priorTx: string,
  priorAcct: WalletAccountBtc,
  value?: number | bigint,
  feeRate?: number | bigint,
  confirmationTarget?: number
}): Promise<{ hash: string, fee: bigint }>
```

**Parameters**: Same as `quoteUpdateTransactionWithHexTX`

**Returns**: `Promise<{ hash: string, fee: bigint }>` - Object containing:
- `hash`: The transaction ID (txid)
- `fee`: The actual fee paid in satoshis

**Transaction Structure**: Same as `quoteUpdateTransactionWithHexTX`

## Example Usage

### Basic Example

```javascript
import WalletManagerBtc from '@tetherto/wdk-wallet-btc'

const wallet = new WalletManagerBtc(seedPhrase, {
  host: 'electrum.blockstream.info',
  port: 50001,
  network: 'testnet'
})

const account = await wallet.getAccount(0)

try {
  // Get the account that owns the prior transaction UTXO
  const priorAccount = await wallet.getAccount(1) // Example: account index 1 owns the priorTx UTXO
  
  // Create an update transaction
  const txHex = await account.quoteUpdateTransactionWithHexTX({
    to: 'tb1q...', // Recipient address
    hex: '48656c6c6f20576f726c64', // Hex-encoded "Hello World"
    priorTx: 'abc123def456...', // Prior transaction ID
    priorAcct: priorAccount, // Account that owns the priorTx UTXO
    value: 1007, // Optional, defaults to 1007 if omitted
    confirmationTarget: 1
  })
  
  console.log('Transaction hex:', txHex)
  
  // Broadcast the transaction manually if needed
  // await account._electrumClient.blockchainTransaction_broadcast(txHex)
  
} catch (error) {
  console.error('Error:', error.message)
} finally {
  account.dispose()
  priorAccount.dispose()
  wallet.dispose()
}
```

### Using Default Value

```javascript
// Get the account that owns the prior transaction UTXO
const priorAccount = await wallet.getAccount(1)

// If value is not provided, it defaults to 1007 sats
const txHex = await account.quoteUpdateTransactionWithHexTX({
  to: 'tb1q...',
  hex: 'deadbeef',
  priorTx: 'abc123def456...',
  priorAcct: priorAccount
  // value defaults to 1007
})
```

### Complete Workflow Example

Here's a complete example showing how to use both functions together:

```javascript
import WalletManagerBtc from '@tetherto/wdk-wallet-btc'

async function updateTransactionWithHex() {
  const wallet = new WalletManagerBtc(seedPhrase, {
    host: 'electrum.blockstream.info',
    port: 50001,
    network: 'testnet'
  })

  const account = await wallet.getAccount(0)
  const priorAccount = await wallet.getAccount(1) // Account that owns the priorTx UTXO
  const recipientAddress = 'tb1q...'
  const priorTransactionId = 'abc123def456...' // From a previous transaction
  const hexData = '48656c6c6f20576f726c64' // "Hello World" in hex

  try {
    // Step 1: Quote the transaction to check fees (optional)
    // Note: quoteUpdateTransactionWithHexTX returns hex, not fee estimate
    // You can inspect the transaction before broadcasting
    const txHex = await account.quoteUpdateTransactionWithHexTX({
      to: recipientAddress,
      hex: hexData,
      priorTx: priorTransactionId,
      priorAcct: priorAccount,
      value: 1007,
      confirmationTarget: 1
    })
    
    console.log('Transaction hex:', txHex)
    
    // Step 2: Inspect the transaction (optional)
    // You can decode and inspect the transaction hex using bitcoinjs-lib:
    // const tx = Transaction.fromHex(txHex)
    // console.log('Inputs:', tx.ins.length) // Should be 2
    // console.log('Outputs:', tx.outs.length) // Should be 3
    
    // Step 3: Send the transaction (broadcasts automatically)
    const result = await account.updateTransactionWithHex({
      to: recipientAddress,
      hex: hexData,
      priorTx: priorTransactionId,
      priorAcct: priorAccount,
      value: 1007,
      confirmationTarget: 1
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
    priorAccount.dispose()
    wallet.dispose()
  }
}

updateTransactionWithHex()
```

### Encoding Data as Hex

```javascript
// Convert string to hex
const text = 'Hello World'
const hexData = Buffer.from(text, 'utf8').toString('hex')
// hexData = '48656c6c6f20576f726c64'

// Convert binary data to hex
const binaryData = Buffer.from([0xde, 0xad, 0xbe, 0xef])
const hexData2 = binaryData.toString('hex')
// hexData2 = 'deadbeef'

// Use in transaction
const txHex = await account.quoteUpdateTransactionWithHexTX({
  to: 'tb1q...',
  hex: hexData,
  priorTx: 'abc123...',
  priorAcct: priorAccount
})
```

### Sending Transaction with `updateTransactionWithHex`

Send and broadcast a transaction that updates a prior transaction:

```javascript
import WalletManagerBtc from '@tetherto/wdk-wallet-btc'

const wallet = new WalletManagerBtc(seedPhrase, {
  host: 'electrum.blockstream.info',
  port: 50001,
  network: 'testnet'
})

const account = await wallet.getAccount(0)
const priorAccount = await wallet.getAccount(1) // Account that owns the priorTx UTXO

try {
  // Send transaction with hex data (broadcasts automatically)
  const result = await account.updateTransactionWithHex({
    to: 'tb1q...', // Recipient address
    hex: '48656c6c6f20576f726c64', // Hex-encoded "Hello World"
    priorTx: 'abc123def456...', // Prior transaction ID
    priorAcct: priorAccount, // Account that owns the priorTx UTXO
    value: 1007, // Optional, defaults to 1007
    feeRate: 10 // Optional fee rate in sats/vB
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
} finally {
  account.dispose()
  priorAccount.dispose()
  wallet.dispose()
}
```

## Error Handling

The function will throw errors in the following cases:

1. **Prior Transaction Not Found**: If the `priorTx` transaction ID cannot be found
   ```javascript
   // Error: Transaction not found or invalid transaction ID
   ```

2. **No 1007 Sat UTXO**: If the prior transaction doesn't contain an output with exactly 1007 sats
   ```javascript
   // Error: No output with value 1007 sats found in transaction <txid>
   ```

3. **Missing Prior Account**: If the `priorAcct` parameter is not provided
   ```javascript
   // Error: priorAcct parameter is required to sign the prior transaction UTXO
   ```

4. **Network Mismatch**: If the `priorAcct` is on a different network than the current account
   ```javascript
   // Error: priorAcct network must match the current account network
   ```

5. **UTXO Script Mismatch**: If the prior transaction UTXO doesn't belong to the `priorAcct` account
   ```javascript
   // Error: Prior transaction UTXO script does not match priorAcct address. Cannot sign this input.
   ```

6. **Hex Data Too Large**: If the hex data exceeds 75 bytes when decoded
   ```javascript
   // Error: OP_RETURN data cannot exceed 75 bytes
   ```

7. **Invalid Hex Format**: If the hex string contains invalid characters
   ```javascript
   // Error: Hex data must be a valid hexadecimal string
   ```

8. **Insufficient Balance**: If there are not enough funds to cover the transaction and fees
   ```javascript
   // Error: Insufficient balance to fund transaction. Need at least <amount> sats.
   ```

9. **No UTXOs Available**: If there are no unspent outputs available in your account
   ```javascript
   // Error: No unspent outputs available for address <address>
   ```

## Best Practices

1. **Choose the Right Function**: 
   - Use `quoteUpdateTransactionWithHexTX` when you want to inspect the transaction hex before broadcasting, or when you need to broadcast manually
   - Use `updateTransactionWithHex` when you want to send and broadcast the transaction immediately (similar to `sendTransactionWithMemo`)
   ```javascript
   // For inspection or manual broadcasting
   const txHex = await account.quoteUpdateTransactionWithHexTX({ to, hex, priorTx, priorAcct })
   
   // For immediate sending
   const result = await account.updateTransactionWithHex({ to, hex, priorTx, priorAcct })
   ```

2. **Validate Hex Data Size**: Always check hex data size before calling the function:
   ```javascript
   const hexData = 'your hex string'
   const dataSize = Buffer.from(hexData, 'hex').length
   if (dataSize > 75) {
     throw new Error('Hex data exceeds 75 bytes when decoded')
   }
   ```

2. **Verify Prior Transaction**: Ensure the prior transaction exists and contains the expected UTXO:
   ```javascript
   const priorTxHex = await account._electrumClient.blockchainTransaction_get(priorTx, false)
   const priorTxObj = Transaction.fromHex(priorTxHex)
   const has1007Utxo = priorTxObj.outs.some(out => out.value === 1007)
   if (!has1007Utxo) {
     throw new Error('Prior transaction does not contain 1007 sat UTXO')
   }
   ```

3. **Check UTXO Ownership**: Verify the prior transaction UTXO belongs to the `priorAcct` account:
   ```javascript
   const priorAcctAddress = await priorAcct.getAddress()
   const network = priorAcct._network
   const priorAcctScript = btcAddress.toOutputScript(priorAcctAddress, network)
   const priorTxUtxoScript = priorTxObj.outs[utxoIndex].script
   if (!priorAcctScript.equals(priorTxUtxoScript)) {
     throw new Error('Prior transaction UTXO does not belong to priorAcct account')
   }
   ```

4. **Verify Network Matching**: Ensure both accounts are on the same network:
   ```javascript
   if (account._network.name !== priorAcct._network.name) {
     throw new Error('Accounts must be on the same network')
   }
   ```

5. **Handle Errors Gracefully**: Wrap calls in try-catch blocks:
   ```javascript
   try {
     const result = await account.updateTransactionWithHex({
       to, hex, priorTx, priorAcct, value
     })
     // Handle success
   } catch (error) {
     if (error.message.includes('1007 sats')) {
       // Handle missing UTXO
     } else if (error.message.includes('script does not match')) {
       // Handle ownership issue
     } else if (error.message.includes('75 bytes')) {
       // Handle data size issue
     } else if (error.message.includes('priorAcct')) {
       // Handle priorAcct related errors
     } else {
       // Handle other errors
     }
   }
   ```

6. **Use Appropriate Networks**: Use testnet for development and testing:
   ```javascript
   const wallet = new WalletManagerBtc(seedPhrase, {
     network: 'testnet' // Use 'bitcoin' for mainnet
   })
   ```

7. **Dispose Resources**: Always dispose of accounts and wallets when done:
   ```javascript
   account.dispose()
   priorAcct.dispose()
   wallet.dispose()
   ```

## Technical Details

### Transaction Construction

Both functions construct the transaction using the same process:

1. **Fetches Prior Transaction**: Retrieves the prior transaction using the Electrum client
2. **Finds UTXO**: Searches for an output with exactly 1007 sats in the prior transaction
3. **Validates Ownership**: Verifies the UTXO script matches the `priorAcct`'s address script
4. **Validates Network**: Ensures `priorAcct` is on the same network as the current account
5. **Selects Funding UTXO**: Chooses a UTXO from the current account to fund the transaction
6. **Calculates Fees**: Estimates transaction size and calculates fees
7. **Builds Transaction**: Creates a PSBT with 2 inputs and 3 outputs
8. **Signs Transaction**: Signs inputs individually:
   - First input (priorTx UTXO) is signed by `priorAcct`
   - Second input (main account UTXO) is signed by the current account
9. **Final Step**:
   - `quoteUpdateTransactionWithHexTX`: Returns the signed transaction as a hexadecimal string
   - `updateTransactionWithHex`: Broadcasts the transaction and returns `{ hash, fee }`

### OP_RETURN Output

The OP_RETURN output is created using the `createOpReturnScriptFromHex` helper function:
- Converts hex string to binary data
- Validates data size (max 75 bytes)
- Creates script: `OP_RETURN (0x6a) + OP_PUSHNUM_1 (0x51) + push opcode + data`

### Fee Calculation

Fees are calculated based on:
- Transaction overhead: ~11 vbytes
- Input size: ~68 vbytes (P2WPKH) or ~58 vbytes (P2TR) per input
- Output size: ~31 vbytes (P2WPKH) or ~43 vbytes (P2TR) per output
- Total: `(overhead + (2 × input_size) + (3 × output_size)) × feeRate`

The function uses an initial estimate and then adjusts based on the actual transaction size.

### UTXO Selection

The function selects UTXOs as follows:
1. **Prior Transaction UTXO**: Fixed at 1007 sats from the specified prior transaction
2. **Funding UTXO**: Selected from account's unspent outputs:
   - Prefers UTXOs with value >= `sendValue + estimatedFee`
   - Falls back to the largest available UTXO if no single UTXO is sufficient

## Use Cases

### Transaction Chains

Create a chain of related transactions:
```javascript
// Get accounts
const account = await wallet.getAccount(0)
const priorAccount = await wallet.getAccount(1) // Account that owns the priorTx UTXOs

// First transaction
const tx1 = await priorAccount.sendTransaction({ to: address, value: 1007 })
const tx1Id = tx1.hash

// Update transaction referencing the first (signed by priorAccount for first input, account for second)
// Option 1: Get hex and broadcast manually
const tx2Hex = await account.quoteUpdateTransactionWithHexTX({
  to: address,
  hex: 'update1',
  priorTx: tx1Id,
  priorAcct: priorAccount
})
await account._electrumClient.blockchainTransaction_broadcast(tx2Hex)
const tx2Id = Transaction.fromHex(tx2Hex).getId()

// Option 2: Use updateTransactionWithHex to broadcast automatically
const tx2 = await account.updateTransactionWithHex({
  to: address,
  hex: 'update1',
  priorTx: tx1Id,
  priorAcct: priorAccount
})
const tx2Id = tx2.hash

// Another update referencing the second transaction
const tx3 = await account.updateTransactionWithHex({
  to: address,
  hex: 'update2',
  priorTx: tx2Id,
  priorAcct: priorAccount
})
console.log('Chain created:', tx1Id, '->', tx2Id, '->', tx3.hash)
```

### Binary Data Embedding

Embed binary data or encoded metadata:
```javascript
// Get the account that owns the prior transaction UTXO
const priorAccount = await wallet.getAccount(1)

// Encode JSON as hex
const metadata = { id: 12345, timestamp: Date.now() }
const jsonHex = Buffer.from(JSON.stringify(metadata), 'utf8').toString('hex')

// Send transaction with embedded metadata
const result = await account.updateTransactionWithHex({
  to: address,
  hex: jsonHex,
  priorTx: priorTxId,
  priorAcct: priorAccount
})

console.log('Transaction with metadata:', result.hash)
```

### Transaction References

Link transactions together with references:
```javascript
// Get the account that owns the prior transaction UTXO
const priorAccount = await wallet.getAccount(1)

// Reference another transaction ID
const referenceTxId = 'abc123...'
const referenceHex = Buffer.from(referenceTxId, 'hex').toString('hex')

// Send transaction linking to another transaction
const result = await account.updateTransactionWithHex({
  to: address,
  hex: referenceHex,
  priorTx: priorTxId,
  priorAcct: priorAccount
})

console.log('Linked transaction:', result.hash, 'references', referenceTxId)
```

## See Also

- [WITH_MEMO_USAGE.md](./WITH_MEMO_USAGE.md) - Documentation for memo-related functions
- [README.md](./README.md) - Main package documentation
- [BIP-86 (Taproot)](https://github.com/bitcoin/bips/blob/master/bip-0086.mediawiki) - Taproot derivation path specification
- [BIP-340 (Schnorr Signatures)](https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki) - Schnorr signature specification
- [OP_RETURN Documentation](https://en.bitcoin.it/wiki/OP_RETURN) - Bitcoin OP_RETURN opcode documentation
