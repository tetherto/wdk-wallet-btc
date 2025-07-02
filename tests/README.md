# wdk-wallet-btc Test Setup

This guide explains how to set up your local development environment to run tests for the `WalletManagerBtc` module.

---

## Prerequisites

Ensure the following are installed:

* **[Node.js](https://nodejs.org/)** ≥ 18
* **[Bitcoin Core](https://bitcoin.org/en/download)**
* **[Rust & Cargo](https://rustup.rs/)**
* **`npm` or `yarn`** for dependency management and test execution.

---

## Environment Configuration

### `.env` File

Create a `.env` file at the root of the project, similar to `.env.example`. This file defines where `bitcoind` stores data, and how `electrs` communicates with the Bitcoin daemon.

---

## Automated Test Setup & Teardown

Running the test suite will automatically:

* Start a clean `bitcoind` regtest environment
* Prime the blockchain and fund the test wallet
* Launch an `electrs` server
* Tear everything down after tests complete

### Skip Automatic Setup

To preserve the environment and inspect it manually after tests:

```bash
SKIP_TEARDOWN=1 npm run test
```

This could be useful in debugging behavior after failures.

To run tests against a preconfigured environment, skip test setup:

```bash
SKIP_SETUP=1 npm run test
```

---

## (Optional) Manual Setup & Teardown

### Step 1: Configure and Run Bitcoin Core (Regtest Mode)

#### 1. Start `bitcoind` in regtest mode with explicit data directory:

```bash
bitcoind -regtest -daemon \
  -txindex=1 \
  -fallbackfee=0.0002 \
  -server=1 \
  -minrelaytxfee=0.00000100 \
  -datadir=<your-datadir>
```

> You have to restart `bitcoind` if you change any flags or configuration.

> The `-minrelaytxfee=0.00000100` option makes sure transactions with a min fee of 141 sats are accepted.

---

#### 2. Create a wallet and generate initial blocks

Create the wallet.

```bash
bitcoin-cli -regtest -datadir=<your-datadir> createwallet testwallet
```

Or if testwallet already exists, run:

```bash
bitcoin-cli -regtest -datadir=<your-datadir> loadwallet testwallet
```

Then fetch the wallet's address and fund it. We generate 101 blocks because newly mined rewards require 100 confirmations before they become spendable.

```bash
ADDRESS=$(bitcoin-cli -regtest -datadir=<your-datadir> -rpcwallet=testwallet getnewaddress)

bitcoin-cli -regtest -datadir=<your-datadir> generatetoaddress 101 $ADDRESS
```

You can verify the balance with:

```bash
bitcoin-cli -regtest -datadir=<your-datadir> -rpcwallet=testwallet getbalance
```

---

### Step 2: Install and Run Electrum Server

#### 1. Install `electrs` if not already installed:

```bash
cargo install --locked electrs
```

#### 2. Run `electrs` connected to your `bitcoind`

```bash
electrs \
  --network regtest \
  --daemon-dir <your-datadir> \
  --electrum-rpc-addr 127.0.0.1:50001
```

When successful, you'll see logs like:

```
Indexer finished: height=101
Electrum RPC server running on 127.0.0.1:50001
```

**Important**:
- After every transaction, you should mine a new block using generatetoaddress 1 <miner_addr>. This prevents "too-long-mempool-chain" errors. You could start `bitcoind` with flags that increase ancestor/descendant limits – but this introduces non-default behavior and can mask real-world issues.
- Always wait around 1.5 seconds after mining a block to allow Electrum to pick up the new block. If you skip this delay, Electrum may not reflect the most recent changes.

---

### Troubleshooting

* **Electrs fails to start or can't find `.cookie`**
  Ensure you're pointing to `--daemon-dir=<your-datadir>` and `bitcoind` is running.

* **Electrs returns 401 / auth errors**
  Make sure `.cookie` is present. Do not use `--auth` if you're relying on cookie-based auth.

* **Can't broadcast tx or wallet is empty**
  Confirm 101 blocks have been mined after funding the wallet address:

  ```bash
  bitcoin-cli -regtest -datadir=<your-datadir> -rpcwallet=testwallet getwalletinfo
  ```

* **Enable more detailed Electrs logs:**

  ```bash
  RUST_LOG=debug electrs --network regtest --daemon-dir <your-datadir> --electrum-rpc-addr 127.0.0.1:50001
  ```

* **Check balances or transactions manually:**

  ```bash
  bitcoin-cli -regtest -datadir=<your-datadir> -rpcwallet=testwallet listunspent
  bitcoin-cli -regtest -datadir=<your-datadir> getrawtransaction <txid> true
  ```

---

### Manual Teardown

To make tests fully isolated and idempotent, wipe and reset the entire regtest environment before each test session:
```bash
bitcoin-cli -regtest -datadir=<your-datadir> stop
rm -rf <your-datadir>
```
This ensures:
- empty mempool
- no leftover wallet txs from previous tests
- clean block and chainstate
