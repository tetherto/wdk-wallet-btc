# @tetherto/wdk-wallet-btc

[![npm version](https://img.shields.io/npm/v/%40tetherto%2Fwdk-wallet-btc?style=flat-square)](https://www.npmjs.com/package/@tetherto/wdk-wallet-btc)
[![npm downloads](https://img.shields.io/npm/dw/%40tetherto%2Fwdk-wallet-btc?style=flat-square)](https://www.npmjs.com/package/@tetherto/wdk-wallet-btc)
[![license](https://img.shields.io/npm/l/%40tetherto%2Fwdk-wallet-btc?style=flat-square)](https://github.com/tetherto/wdk-wallet-btc/blob/main/LICENSE)
[![docs](https://img.shields.io/badge/docs-docs.wdk.tether.io-0A66C2?style=flat-square)](https://docs.wdk.tether.io/sdk/wallet-modules/wallet-btc)

**Note**: This package is currently in beta. Please test thoroughly in development environments before using in production.

A Bitcoin wallet module for WDK. It derives BIP-84 Native SegWit or BIP-44 legacy accounts from BIP-39 seed phrases and supports balance queries, transaction signing and broadcasting, transfer history, and message signing.

## About WDK

This module is part of the [**WDK (Wallet Development Kit)**](https://docs.wdk.tether.io/) project, which empowers developers to build secure, non-custodial wallets with unified blockchain access, stateless architecture, and complete user control.

For detailed documentation about the complete WDK ecosystem, visit [docs.wdk.tether.io](https://docs.wdk.tether.io).

## Installation

```bash
npm install @tetherto/wdk-wallet-btc
```

## Quick Start

> **Existing BIP-44 wallets:** Since `v1.0.0-beta.4`, the default is BIP-84. When reopening a wallet created with the earlier BIP-44 default, set `bip: 44`; otherwise, the same seed derives different addresses. See [Configuration](https://docs.wdk.tether.io/sdk/wallet-modules/wallet-btc/configuration) for derivation details.

> **Security:** The seed phrase below is public test data. Never use it to hold funds. Generate and protect a unique BIP-39 seed phrase before using a wallet in production.

```javascript
import WalletManagerBtc from '@tetherto/wdk-wallet-btc'

const seedPhrase = 'cook voyage document eight skate token alien guide drink uncle term abuse'

const wallet = new WalletManagerBtc(seedPhrase, {
  network: 'bitcoin',
  bip: 84
})

const account = await wallet.getAccount(0)
const address = await account.getAddress()
console.log('Address:', address)

wallet.dispose()
```

Call `dispose()` when finished to erase account private-key material and close internally managed client connections. Never log or expose the seed phrase or `account.keyPair.privateKey`.

Passing a seed phrase wraps it in a `SeedSignerBtc` for you as the default signer. To supply your own signer, register a `PrivateKeySignerBtc` or `SeedSignerBtc` by name with `addSigner`, or create a standalone account from a raw private key with `WalletAccountBtc.fromPrivateKey`.

## Key Capabilities

- **BIP-39 Wallets**: Derive multiple Bitcoin accounts from a seed phrase
- **BIP-84 and BIP-44 Support**: Use Native SegWit addresses by default or retain legacy P2PKH derivation
- **Multiple Signers**: Use `SeedSignerBtc` for HD derivation, register `PrivateKeySignerBtc` instances by name, or import custom signers implementing `ISignerBtc`
- **Bitcoin Transactions**: Quote, sign, and broadcast single-recipient BTC transactions
- **UTXO Account Data**: Query balances, transfer history, confirmed receipts, and maximum spendable amounts
- **Message Signing**: Sign messages and verify signatures for Bitcoin accounts
- **Read-Only Accounts**: Monitor an address and verify signatures without exposing a private key
- **Flexible Clients**: Use Blockbook HTTP, Electrum over TCP, TLS, SSL, or WebSocket, custom clients, and ordered failover
- **Fee Management**: Retrieve network fee rates and quote transaction costs in satoshis
- **Secure Memory Disposal**: Erase private-key material and close internally managed connections when done

## Compatibility

- **Networks**: Bitcoin mainnet, testnet, and regtest
- **Address Types**: BIP-84 P2WPKH (Native SegWit) and BIP-44 P2PKH (legacy)
- **Bitcoin Clients**: Blockbook HTTP, Electrum TCP/TLS/SSL/WebSocket, or a custom `IBtcClient`
- **Runtimes**: Node.js and Bare

> **Production clients:** The default public Electrum endpoint is provided for convenience. Configure a Bitcoin service you operate or trust for production; public endpoints can be slow or unavailable for addresses with extensive transaction histories. See [Configuration](https://docs.wdk.tether.io/sdk/wallet-modules/wallet-btc/configuration) for Electrum, Blockbook, custom-client, and failover options.

> **TLS/SSL:** Electrum TLS and SSL connections verify the server certificate and hostname. Configure a certificate trusted by the client; self-signed or hostname-mismatched certificates are rejected. The default plaintext TCP transport is unchanged.

## Documentation

| Topic | Description | Link |
|-------|-------------|------|
| Overview | Module overview and feature summary | [Wallet BTC Overview](https://docs.wdk.tether.io/sdk/wallet-modules/wallet-btc) |
| Usage | End-to-end integration walkthrough | [Wallet BTC Usage](https://docs.wdk.tether.io/sdk/wallet-modules/wallet-btc/usage) |
| Configuration | Network, derivation, client, and failover configuration | [Wallet BTC Configuration](https://docs.wdk.tether.io/sdk/wallet-modules/wallet-btc/configuration) |
| API Reference | Complete class, client, and type reference | [Wallet BTC API Reference](https://docs.wdk.tether.io/sdk/wallet-modules/wallet-btc/api-reference) |

## Community

Join the [WDK Discord](https://discord.gg/arYXDhHB2w) to connect with other developers.

## Support

For support, please [open an issue](https://github.com/tetherto/wdk-wallet-btc/issues) on GitHub or reach out via [email](mailto:wallet-info@tether.io).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
