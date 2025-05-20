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

import WalletManagerBtc from "../src/wallet-manager-btc.js";

import config from "./test.config.json" with { type: "json" }

let walletManager;

beforeAll(async () => {
  const seedPhrase = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
  walletManager = new WalletManagerBtc(seedPhrase, null,{
    port: config.port,
    host: config.host,
    network: config.network,
  });

});

describe("WalletManagerBtc Signing and Transaction Tests", () => {
  test("account attributes match BIP84 test vectors", async () => {
    //Source: https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki#test-vectors
    const seedPhrase = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    const walletManager = new WalletManagerBtc(seedPhrase, null, {
      port: config.port,
      host: config.host,
      network: 'bitcoin',
    });
    const account = await walletManager.getAccount();
    const addr = await account.getAddress()
    expect(account.keyPair.privateKey).toEqual("KyZpNDKnfs94vbrwhJneDi77V6jF64PWPF8x5cdJb8ifgg2DUc9d")
    expect(account.keyPair.publicKey).toEqual("0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c")
    expect(addr).toEqual("bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu")
    expect(account.path).toEqual("m/84'/0'/0'/0/0")
  });

  test("should sign a message", async () => {
    const account = await walletManager.getAccount();
    const signature = await account.sign("Hello, world!");
    expect(signature).toBeTruthy();
  });

  test("should verify a message signature", async () => {
    const account = await walletManager.getAccount();
    const signature = await account.sign("Hello, world!");
    const isValid = await account.verify("Hello, world!", signature);
    expect(isValid).toBe(true);
  });

  test("should reject an invalid message signature", async () => {
    const account = await walletManager.getAccount();
    const isValid = await account.verify("Hello, world!", "invalid");
    expect(isValid).toBe(false);
  });

  test("should generate a valid seed phrase", () => {
    const seedPhrase = WalletManagerBtc.getRandomSeedPhrase();
    expect(typeof seedPhrase).toBe("string");
    expect(seedPhrase.split(" ").length).toBeGreaterThanOrEqual(12); // usually 12 or 24 words
    expect(WalletManagerBtc.isValidSeedPhrase(seedPhrase)).toBe(true);
  });

  test("should return true for a valid seed phrase", () => {
    const validSeed = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    expect(WalletManagerBtc.isValidSeedPhrase(validSeed)).toBe(true);
  });

  test("should return false for an invalid seed phrase", () => {
    const invalidSeed = "this is not a real seed phrase";
    expect(WalletManagerBtc.isValidSeedPhrase(invalidSeed)).toBe(false);
  });

  test("should return false for empty seed phrase", () => {
    expect(WalletManagerBtc.isValidSeedPhrase("")).toBe(false);
  });
  
  test("should get address balance", async () => {
    const account = await walletManager.getAccount();
    const bal = await account.getBalance()
    expect(typeof bal).toBe('number')
  });

  test("should support deriv paths ", async () => {
    const path = 'm/84\'/0\'/1\'/0'
    const seedPhrase = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    const wm = new WalletManagerBtc(seedPhrase, path, {
      port: config.port,
      host: config.host,
      network: 'bitcoin',
    });

    const account = await wm.getAccount();
    const oldAccount = await walletManager.getAccount()
    expect(account.path).toEqual("m/84'/0'/1'/0/0")
    expect(oldAccount.path).toEqual("m/84'/0'/0'/0/0")
  });

  test("should return fee rate", async () => {
    const { slow, fast } = await walletManager.getFeeRate()

    expect(typeof slow).toBe('number')
    expect(typeof fast).toBe('number')
  });

  it('returns a WalletAccountBtc with the correct properties', async () => {
    const seedPhrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
    const manager = new WalletManagerBtc(seedPhrase)

    const path = "m/84'/0'/0'/3/1"
    const account = await manager.getAccountByPath(path)
    expect(account.path).toBe(path)

  })

  test(
    "should send a transaction successfully",
    async () => {
      const to = "bcrt1q03lzm6tjtlng04lchtlpfk9hp93f5yrgklavtv";
      const account = await walletManager.getAccount();
      const value = 10000;

      const result = await account.sendTransaction({ to, value });
      expect(result).toBeTruthy();
    },
    30000 
  );

  test(
    "get transfer history",
    async () => {
      const account = await walletManager.getAccount();
      const res = await account.getTransfers({})
      expect(res.length).toBe(10)
      const res2 = await account.getTransfers({ skip: 9, limit:  1})
      expect(res2.length).toBe(1)
      expect(res[9].txid).toBe(res2[0].txid)
    },
    30000 
  );

  test(
    "quote transactions",
    async () => {
      const account = await walletManager.getAccount();
      const to = "bcrt1q03lzm6tjtlng04lchtlpfk9hp93f5yrgklavtv";
      const value = 10000;
      const fee = await account.quoteTransaction({ to, value})
      expect(fee > 0).toBe(true)
      expect(Number.isInteger(fee)).toBe(true)
    },
    30000 
  );
});
