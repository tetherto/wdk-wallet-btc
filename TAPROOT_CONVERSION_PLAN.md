# Taproot (P2TR) Conversion Plan

## Overview
This document outlines the plan to convert the wallet from Native Segwit (P2WPKH) to Taproot (P2TR) support. The current implementation uses BIP-84 derivation paths and P2WPKH addresses. Taproot requires BIP-86 derivation paths, Bech32m address encoding, and Schnorr signatures.

## Current Implementation Analysis

### Key Components
1. **Derivation Path**: Uses BIP-84 (`m/84'/0'`) for P2WPKH addresses
2. **Address Generation**: `payments.p2wpkh()` from bitcoinjs-lib
3. **Address Format**: Bech32 addresses (starts with `bc1q` for mainnet, `bcrt1q` for regtest)
4. **Transaction Signing**: ECDSA signatures via PSBT with HD key derivation
5. **Script Parsing**: Uses `payments.p2wpkh()` to decode outputs in `getTransfers()`

### Files Requiring Changes
- `src/wallet-account-btc.js` - Main wallet account implementation
- `src/wallet-manager-btc.js` - Wallet manager (may need updates for BIP-86 references)
- `types/src/wallet-account-btc.d.ts` - TypeScript definitions
- `tests/wallet-account-btc.test.js` - Test suite

## Conversion Plan

### Phase 0: Script Type Config

#### 0.1 Add script_type to BtcWalletConfig
- **File**: `src/wallet-account-read-only-btc.js` (BtcWalletConfig typedef, ~line 44)
- **File**: `types/src/wallet-account-read-only-btc.d.ts` (BtcWalletConfig type, ~line 122)
- **Change**: Add a `script_type` property after the `bip` property in `BtcWalletConfig`
- **Details**:
  - Property name: `script_type`
  - Type: `"P2WPKH" | "P2TR"`
  - Position: After `bip` property
  - Default value: `"P2WPKH"` if not provided
  - Purpose: Specifies the script type of the wallet created by `WalletManagerBtc`
- **Implementation**:
  - Add `script_type?: "P2WPKH" | "P2TR"` to the JSDoc typedef
  - Add corresponding TypeScript type definition
  - Update default handling logic in `WalletManagerBtc` to use `"P2WPKH"` when `script_type` is undefined

### Phase 1: Core Infrastructure Changes

#### 1.1 Update Derivation Path Constants
- **File**: `src/wallet-account-btc.js`
- **Change**: Replace `BIP_84_BTC_DERIVATION_PATH_PREFIX = "m/84'/0'"` with `BIP_86_BTC_DERIVATION_PATH_PREFIX = "m/86'/0'"`
- **Impact**: All new accounts will use BIP-86 derivation paths
- **Consideration**: Decide if we want to maintain backward compatibility or make a clean break

#### 1.2 Update Address Generation
- **File**: `src/wallet-account-btc.js` (constructor, line ~135)
- **Change**: Replace `payments.p2wpkh()` with `payments.p2tr()`
- **Details**:
  - P2TR requires a tweaked public key (internal key + Taproot tweak)
  - For single-key spends (BIP-86), the internal key is the BIP32 derived public key
  - The output key is: `internalPubKey + H(internalPubKey || 0x00) * G`
- **Code Pattern**:
  ```javascript
  const { address } = payments.p2tr({
    internalPubkey: this._account.publicKey.slice(1), // Remove 0x02/0x03 prefix
    network: this._electrumClient.network
  })
  ```

#### 1.3 Verify bitcoinjs-lib Taproot Support
- **Action**: Verify that `bitcoinjs-lib` v6.1.7 supports `payments.p2tr()`
- **If not supported**: May need to upgrade to a newer version (v6.2.0+)
- **Check**: Ensure Schnorr signature support is available

### Phase 2: Transaction Signing Updates

#### 2.1 Update PSBT Input Creation
- **File**: `src/wallet-account-btc.js` (`_getRawTransaction` method, ~line 456)
- **Changes**:
  - Update `psbt.addInput()` to support Taproot inputs
  - Add `tapInternalKey` field instead of/replacing `bip32Derivation`
  - Ensure witness UTXO is properly formatted
- **Details**:
  - Taproot inputs require `tapInternalKey` in the PSBT
  - May need to use `tapBip32Derivation` instead of `bip32Derivation`
  - Witness UTXO format remains similar but script is P2TR output script

#### 2.2 Update Transaction Signing
- **File**: `src/wallet-account-btc.js` (`_getRawTransaction` method, ~line 472)
- **Changes**:
  - Replace `psbt.signInputHD()` with Taproot-compatible signing
  - May need to use `psbt.signInput()` with Schnorr signature support
  - Verify that `@bitcoinerlab/secp256k1` supports Schnorr signatures
- **Details**:
  - Taproot uses Schnorr signatures (BIP-340) instead of ECDSA
  - Signature format: 64 bytes (r, s concatenated)
  - May need to check if `signInputHD` automatically handles Taproot or requires different method

#### 2.3 Update Fee Estimation
- **File**: `src/wallet-account-btc.js` (`_getRawTransaction` method, ~line 479)
- **Consideration**: Taproot transactions may have different virtual sizes
  - P2TR outputs: 43 bytes (vs 31 bytes for P2WPKH)
  - Input witness: ~57 bytes (vs ~107 bytes for P2WPKH)
  - Overall, Taproot transactions are typically smaller
- **Action**: Verify fee calculation still works correctly with `virtualSize()`

### Phase 3: Transaction History and Parsing

#### 3.1 Update Script Parsing in getTransfers()
- **File**: `src/wallet-account-btc.js` (`getTransfers` method, ~lines 330, 354)
- **Changes**:
  - Replace `payments.p2wpkh()` calls with `payments.p2tr()` for output script parsing
  - Handle both P2WPKH (for backward compatibility) and P2TR outputs
  - Update address matching logic to handle Bech32m format
- **Details**:
  - P2TR output scripts are 34 bytes: `OP_1 <32-byte witness program>`
  - Need to decode and match against Taproot addresses

#### 3.2 Update Address Matching Logic
- **File**: `src/wallet-account-btc.js` (`getTransfers` method)
- **Changes**:
  - Update `isAddressMatch()` and `extractAddress()` functions
  - Support both Bech32 (P2WPKH) and Bech32m (P2TR) address formats
  - Consider if we want to filter by address type or support both

### Phase 4: Network Configuration

#### 4.1 Update Network Constants
- **File**: `src/wallet-account-btc.js` (BITCOIN constant, ~line 70)
- **Consideration**: Verify network configuration supports Taproot
  - Mainnet: Bech32m addresses start with `bc1p`
  - Testnet: Bech32m addresses start with `tb1p`
  - Regtest: Bech32m addresses start with `bcrt1p`
- **Action**: Ensure network object in bitcoinjs-lib supports these prefixes

### Phase 5: Testing Updates

#### 5.1 Update Test Constants
- **File**: `tests/wallet-account-btc.test.js`
- **Changes**:
  - Update `ACCOUNT` constant with new Taproot address
  - Update expected derivation path to BIP-86 format
  - Generate new test addresses using Taproot derivation
- **Details**:
  - New path: `m/86'/0'/0'/0/0` (instead of `m/84'/0'/0'/0/0`)
  - Address will be Bech32m format (starts with `bcrt1p` for regtest)

#### 5.2 Add Taproot-Specific Tests
- **File**: `tests/wallet-account-btc.test.js`
- **New Tests**:
  - Verify Taproot address generation
  - Test transaction creation and signing with Taproot inputs
  - Verify transaction history parsing for Taproot addresses
  - Test fee estimation with Taproot transactions
  - Verify Schnorr signature generation

#### 5.3 Integration Testing
- **Action**: Test full transaction flow:
  1. Generate Taproot address
  2. Receive funds to Taproot address
  3. Query balance
  4. Send transaction from Taproot address
  5. Verify transaction history

### Phase 6: Documentation and Type Definitions

#### 6.1 Update TypeScript Definitions
- **File**: `types/src/wallet-account-btc.d.ts`
- **Changes**:
  - Update JSDoc comments to reference BIP-86 instead of BIP-84
  - Update path examples in documentation
  - Add notes about Taproot support

#### 6.2 Update Code Comments
- **Files**: All modified files
- **Changes**:
  - Update references from BIP-84 to BIP-86
  - Update comments about P2WPKH to P2TR
  - Add notes about Schnorr signatures

### Phase 7: Backward Compatibility Considerations

#### 7.1 Decision Point: Support Both Address Types?
- **Option A**: Complete migration - only support P2TR
  - Simpler implementation
  - Cleaner codebase
  - Users must migrate existing wallets
  
- **Option B**: Dual support - support both P2WPKH and P2TR
  - More complex but maintains compatibility
  - Requires address type detection
  - May need separate account types or configuration

#### 7.2 Recommendation
- **Initial Implementation**: Option A (P2TR only) for simplicity
- **Future Enhancement**: Option B if backward compatibility is required

## Dependencies Check

### Required Library Updates
1. **bitcoinjs-lib**: Verify v6.1.7 supports Taproot, or upgrade to v6.2.0+
2. **@bitcoinerlab/secp256k1**: Verify Schnorr signature support (BIP-340)
3. **bip32**: Should be compatible (no changes needed)

### Potential Issues
- If `bitcoinjs-lib` v6.1.7 doesn't support Taproot, upgrade may be required
- Schnorr signature support in secp256k1 library needs verification
- PSBT Taproot signing API may differ from current implementation

## Implementation Order

1. **Phase 0**: Script type config (add script_type to BtcWalletConfig)
2. **Phase 1**: Core infrastructure (derivation path, address generation)
3. **Phase 2**: Transaction signing (most critical)
4. **Phase 3**: Transaction parsing (for history)
5. **Phase 4**: Network configuration
6. **Phase 5**: Testing (throughout, but comprehensive at end)
7. **Phase 6**: Documentation
8. **Phase 7**: Backward compatibility decisions

## Risk Assessment

### High Risk Areas
1. **Transaction Signing**: Incorrect Schnorr signature implementation could lead to failed transactions
2. **Address Generation**: Incorrect tweak calculation could generate invalid addresses
3. **Script Parsing**: Incorrect parsing could miss transactions in history

### Mitigation Strategies
1. Extensive testing on regtest network
2. Verify against known-good Taproot implementations
3. Test with real testnet transactions before mainnet deployment
4. Code review focusing on cryptographic operations

## Success Criteria

1. ✅ Generate valid Taproot addresses (Bech32m format)
2. ✅ Successfully receive funds to Taproot addresses
3. ✅ Successfully send transactions from Taproot addresses
4. ✅ Correctly parse transaction history for Taproot addresses
5. ✅ Accurate fee estimation for Taproot transactions
6. ✅ All tests pass
7. ✅ No regressions in existing functionality (if maintaining compatibility)

## References

- [BIP-86: Key Derivation for Single Key Outputs](https://bips.xyz/86)
- [BIP-340: Schnorr Signatures](https://bips.xyz/340)
- [BIP-341: Taproot](https://bips.xyz/341)
- [BIP-342: Validation of Taproot Scripts](https://bips.xyz/342)
- [bitcoinjs-lib Taproot Documentation](https://github.com/bitcoinjs/bitcoinjs-lib)

## Notes

- Taproot activation block: 709,632 (November 2021)
- Bech32m encoding is required for P2TR addresses
- Single-key Taproot spends (BIP-86) are the simplest case and recommended for wallets
- Script path spending (complex scripts) can be added later if needed

