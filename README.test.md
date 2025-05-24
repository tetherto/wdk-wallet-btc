# wdk-wallet-btc Integration Test Setup

This guide explains how to set up your local machine to run integration tests for the `WalletManagerBtc`.

---

## Prerequisites

Ensure the following tools are installed:

- [Node.js](https://nodejs.org/) ≥ 18
- [Bitcoin Core](https://bitcoin.org/en/download)
- [Rust & Cargo](https://rustup.rs) (for `electrs`)
- `npm` or `yarn`

---

## Step 1: Configure and Run Bitcoin Core (Regtest Mode)

### 1. Start `bitcoind`:

```bash
bitcoind -regtest -daemon \
  -rpcuser=admin \
  -rpcpassword=admin \
  -txindex=1 \
  -fallbackfee=0.0002 \
  -server=1
```

### 2. Create and fund a wallet:

```bash
bitcoin-cli -regtest -rpcuser=admin -rpcpassword=admin createwallet testwallet
ADDRESS=$(bitcoin-cli -regtest -rpcuser=admin -rpcpassword=admin getnewaddress)
bitcoin-cli -regtest -rpcuser=admin -rpcpassword=admin generatetoaddress 101 $ADDRESS
```

---

## Step 2: Install and Run Electrum Server

### 1. Install `electrs`:

```bash
cargo install --locked electrs
```

### 2. Run `electrs`:

```bash
electrs \
  --network regtest \
  --daemon-dir ~/.bitcoin/regtest \
  --electrum-rpc-addr 127.0.0.1:50001
```

> Wait for Electrs to sync with `bitcoind`.

---

## Step 3: Run Integration Tests

```bash
npm run test:integration
```

---

## Troubleshooting

- Ensure Electrs and Bitcoin Core use the same data directory (`~/.bitcoin/regtest`).
- Confirm `txindex=1` is enabled in Bitcoin Core.
- Use `bitcoin-cli` to mine blocks when needed:
  ```bash
  bitcoin-cli -regtest -rpcuser=admin -rpcpassword=admin generatetoaddress 1 $ADDRESS
  ```
- Always generate at least 101 blocks to access funds.

---

## Cleanup

```bash
bitcoin-cli -regtest -rpcuser=admin -rpcpassword=admin stop
```

> Electrs exits automatically once `bitcoind` stops.
