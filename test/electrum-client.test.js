// Copyright 2024 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

"use strict";

import ElectrumClient from "../src/electrum-client.js";

import config from "./test.config.json" with { type: "json" }

let client;

const { testAddress, testTxid } = config

beforeAll(async () => {
  client = new ElectrumClient({
    port: config.port,
    host: config.host,
    network: config.network,
  });
  await client.connect();
});

afterAll(async () => {
  if (client.isConnected()) {
    await client.disconnect();
  }
});

describe("ElectrumClient Basic Connectivity", () => {
  test("should connect to Electrum server", () => {
    expect(client.isConnected()).toBe(true);
  });
});

describe("ElectrumClient Wallet Operations", () => {
  test("should get balance for test address", async () => {
    const balance = await client.getBalance(testAddress);
    expect(balance).toHaveProperty("confirmed");
    expect(balance).toHaveProperty("unconfirmed");
    expect(typeof balance.confirmed).toBe("number");
    expect(typeof balance.unconfirmed).toBe("number");
  });

  test("should get history for test address", async () => {
    const history = await client.getHistory(testAddress);
    expect(Array.isArray(history)).toBe(true);
    if (history.length > 0) {
      const tx = history[0];
      expect(tx).toHaveProperty("tx_hash");
      expect(tx).toHaveProperty("height");
    }
  });

  test("should get unspent outputs for test address", async () => {
    const unspent = await client.getUnspent(testAddress);
    expect(Array.isArray(unspent)).toBe(true);
    if (unspent.length > 0) {
      const utxo = unspent[0];
      expect(utxo).toHaveProperty("tx_hash");
      expect(utxo).toHaveProperty("tx_pos");
      expect(utxo).toHaveProperty("value");
      expect(utxo).toHaveProperty("height");
    }
  });

  test("should get transaction details", async () => {
    const tx = await client.getTransaction(testTxid);
    expect(typeof tx).toBe("object");
    expect(tx).toHaveProperty("hash");
    expect(tx).toHaveProperty("txid");
  });

  test("should get fee estimates", async () => {
    const fee = await client.getFeeEstimate(1);
    expect(typeof fee).toBe("number");
    expect(fee).toBeGreaterThan(0);
  });

  test("should handle script hash calculation", () => {
    const scriptHash = client.getScriptHash(testAddress);
    expect(typeof scriptHash).toBe("string");
    expect(scriptHash.length).toBe(64);
  });

  test("should handle disconnection and reconnection", async () => {
    await client.disconnect();
    expect(client.isConnected()).toBe(false);

    await client.connect();
    expect(client.isConnected()).toBe(true);
  });
});

describe("ElectrumClient Error Handling", () => {
  test("should handle invalid address", async () => {
    const invalidAddress = "invalid-address";
    await expect(client.getBalance(invalidAddress)).rejects.toThrow();
  });

  test("should handle invalid transaction ID", async () => {
    const invalidTxid = "invalid-txid";
    await expect(client.getTransaction(invalidTxid)).rejects.toThrow();
  });

  test("should handle invalid broadcast", async () => {
    const invalidTx = "invalid-transaction-hex";
    await expect(client.broadcastTransaction(invalidTx)).rejects.toThrow();
  });
});
