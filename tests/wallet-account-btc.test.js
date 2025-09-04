import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import { HOST, PORT, ELECTRUM_PORT, ZMQ_PORT, DATA_DIR, ACCOUNT_CONFIG } from './config.js'
import accountFixtures, { BitcoinCli, Waiter } from './helpers/index.js'

import { WalletAccountBtc, WalletAccountReadOnlyBtc } from '../index.js'

const {
  SEED_PHRASE,
  SEED,
  getExpectedSignature,
  ACCOUNT_BIP44,
  ACCOUNT_BIP84
} = accountFixtures

describe('WalletAccountBtc', () => {
  const bitcoin = new BitcoinCli({
    host: HOST,
    port: PORT,
    zmqPort: ZMQ_PORT,
    dataDir: DATA_DIR,
    wallet: 'testwallet'
  })

  const waiter = new Waiter(bitcoin, {
    host: HOST,
    electrumPort: ELECTRUM_PORT,
    zmqPort: ZMQ_PORT
  })

  let account, recipient

  beforeAll(async () => {
    account = new WalletAccountBtc(SEED_PHRASE, "0'/0/0", ACCOUNT_CONFIG)
    recipient = bitcoin.getNewAddress()

    bitcoin.sendToAddress(ACCOUNT_BIP44.address, 0.01)
    await waiter.mine()
  })

  afterAll(() => {
    account.dispose()
  })

  describe('constructor', () => {
    test('should successfully initialize an account for the given seed phrase and path (BIP44)', () => {
      const acc = new WalletAccountBtc(SEED_PHRASE, "0'/0/0")
      expect(acc.index).toBe(ACCOUNT_BIP44.index)
      expect(acc.path).toBe(ACCOUNT_BIP44.path)
      expect(acc.keyPair).toEqual({
        privateKey: new Uint8Array(Buffer.from(ACCOUNT_BIP44.keyPair.privateKey, 'hex')),
        publicKey: new Uint8Array(Buffer.from(ACCOUNT_BIP44.keyPair.publicKey, 'hex'))
      })
      acc.dispose()
    })

    test('should successfully initialize an account for the given seed and path (BIP44)', () => {
      const acc = new WalletAccountBtc(SEED, "0'/0/0")
      expect(acc.index).toBe(ACCOUNT_BIP44.index)
      expect(acc.path).toBe(ACCOUNT_BIP44.path)
      expect(acc.keyPair).toEqual({
        privateKey: new Uint8Array(Buffer.from(ACCOUNT_BIP44.keyPair.privateKey, 'hex')),
        publicKey: new Uint8Array(Buffer.from(ACCOUNT_BIP44.keyPair.publicKey, 'hex'))
      })
      acc.dispose()
    })

    test('should successfully initialize an account for the given seed and path (BIP84)', () => {
      const acc = new WalletAccountBtc(SEED, "0'/0/0", { ...ACCOUNT_CONFIG, bip: 84 })
      expect(acc.index).toBe(ACCOUNT_BIP84.index)
      expect(acc.path).toBe(ACCOUNT_BIP84.path)
      expect(acc.keyPair).toEqual({
        privateKey: new Uint8Array(Buffer.from(ACCOUNT_BIP84.keyPair.privateKey, 'hex')),
        publicKey: new Uint8Array(Buffer.from(ACCOUNT_BIP84.keyPair.publicKey, 'hex'))
      })
      acc.dispose()
    })

    test('should throw if the seed phrase is invalid', () => {
      const INVALID_SEED_PHRASE = 'invalid seed phrase'
      expect(() => new WalletAccountBtc(INVALID_SEED_PHRASE, "0'/0/0"))
        .toThrow('The seed phrase is invalid.')
    })

    test('should throw if the path is invalid', () => {
      expect(() => new WalletAccountBtc(SEED_PHRASE, "a'/b/c"))
        .toThrow(/Expected BIP32Path/)
    })

    test('should throw for unsupported bip type', () => {
      expect(() => new WalletAccountBtc(SEED_PHRASE, "0'/0/0", { bip: 33 }))
        .toThrow(/Unsupported BIP type/)
    })
  })

  describe('sign', () => {
    const MESSAGE = 'Dummy message to sign.'
    const SIGNATURE_BIP44 = getExpectedSignature(0, MESSAGE, 44)
    const SIGNATURE_BIP84 = getExpectedSignature(0, MESSAGE, 84)

    test('should return the correct signature (BIP44)', async () => {
      const signature = await account.sign(MESSAGE)
      expect(signature).toBe(SIGNATURE_BIP44)
    })

    test('should return the correct signature (BIP84)', async () => {
      const bip84Account = new WalletAccountBtc(SEED_PHRASE, "0'/0/0", { ...ACCOUNT_CONFIG, bip: 84 })
      const signature = await bip84Account.sign(MESSAGE)
      expect(signature).toBe(SIGNATURE_BIP84)
      bip84Account.dispose()
    })
  })

  describe('verify', () => {
    const MESSAGE = 'Dummy message to sign.'
    const SIGNATURE_BIP44 = getExpectedSignature(0, MESSAGE, 44)
    const SIGNATURE_BIP84 = getExpectedSignature(0, MESSAGE, 84)

    test('should return true for a valid signature (BIP44)', async () => {
      const result = await account.verify(MESSAGE, SIGNATURE_BIP44)
      expect(result).toBe(true)
    })

    test('should return true for a valid signature (BIP84)', async () => {
      const bip84Account = new WalletAccountBtc(SEED_PHRASE, "0'/0/0", { ...ACCOUNT_CONFIG, bip: 84 })
      const result = await bip84Account.verify(MESSAGE, SIGNATURE_BIP84)
      expect(result).toBe(true)
      bip84Account.dispose()
    })

    test('should return false for an invalid signature (BIP44)', async () => {
      const result = await account.verify('Another message.', SIGNATURE_BIP44)
      expect(result).toBe(false)
    })

    test('should return false for an invalid signature (BIP84)', async () => {
      const bip84Account = new WalletAccountBtc(SEED_PHRASE, "0'/0/0", { ...ACCOUNT_CONFIG, bip: 84 })
      const result = await bip84Account.verify('Another message.', SIGNATURE_BIP84)
      expect(result).toBe(false)
      bip84Account.dispose()
    })

    test('should throw on a malformed signature', async () => {
      await expect(account.verify(MESSAGE, 'A bad signature'))
        .rejects.toThrow('Expected Signature')
    })
  })

  describe('sendTransaction', () => {
    test('should successfully send a transaction (BIP44)', async () => {
      const TRANSACTION = { to: recipient, value: 1_000 }
      const { hash, fee } = await account.sendTransaction(TRANSACTION)

      await waiter.mine()

      const baseFee = bitcoin.getTransactionFeeSats(hash)
      expect(fee).toBe(baseFee)
      const tx = bitcoin.getTransaction(hash)
      expect(tx.txid).toBe(hash)
      expect(tx.details[0].address).toBe(TRANSACTION.to)
      const amount = Math.round(tx.details[0].amount * 1e+8)
      expect(amount).toBe(TRANSACTION.value)
    })

    test('should successfully send a transaction (BIP84)', async () => {
      const bip84Account = new WalletAccountBtc(SEED_PHRASE, "0'/0/0", { ...ACCOUNT_CONFIG, bip: 84 })
      const bip84Address = await bip84Account.getAddress()
      bitcoin.sendToAddress(bip84Address, 0.01)
      await waiter.mine()
      const TRANSACTION = { to: recipient, value: 1_000 }
      const { hash, fee } = await bip84Account.sendTransaction(TRANSACTION)
      const { fees } = bitcoin.getMempoolEntry(hash)
      const baseFee = Math.round(fees.base * 1e+8)
      expect(fee).toBe(baseFee)
      const tx = bitcoin.getTransaction(hash)
      expect(tx.txid).toBe(hash)
      expect(tx.details[0].address).toBe(TRANSACTION.to)
      const amount = Math.round(tx.details[0].amount * 1e+8)
      expect(amount).toBe(TRANSACTION.value)
      bip84Account.dispose()
    })

    test('should throw if value is less than the dust limit (BIP44)', async () => {
      await expect(account.sendTransaction({ to: recipient, value: 500 }))
        .rejects.toThrow('The amount must be bigger than the dust limit')
    })

    test('should throw if value is less than the dust limit (BIP84)', async () => {
      const bip84Account = new WalletAccountBtc(SEED_PHRASE, "0'/0/0", { ...ACCOUNT_CONFIG, bip: 84 })
      await expect(bip84Account.sendTransaction({ to: recipient, value: 500 }))
        .rejects.toThrow('The amount must be bigger than the dust limit')
      bip84Account.dispose()
    })

    test('should throw if the account balance does not cover the transaction costs (BIP44)', async () => {
      await expect(account.sendTransaction({ to: recipient, value: 1_000_000_000_000 }))
        .rejects.toThrow('Insufficient balance to send the transaction')
    })

    test('should throw if the account balance does not cover the transaction costs (BIP84)', async () => {
      const bip84Account = new WalletAccountBtc(SEED_PHRASE, "0'/0/0", { ...ACCOUNT_CONFIG, bip: 84 })
      await expect(bip84Account.sendTransaction({ to: recipient, value: 1_000_000_000_000 }))
        .rejects.toThrow('Insufficient balance to send the transaction')
      bip84Account.dispose()
    })

    test('should throw if there an no utxos available (BIP44)', async () => {
      const unfunded = new WalletAccountBtc(SEED_PHRASE, "0'/0/1", ACCOUNT_CONFIG)
      await expect(unfunded.sendTransaction({ to: recipient, value: 1_000 }))
        .rejects.toThrow('No unspent outputs available')
      unfunded.dispose()
    })

    test('should throw if there an no utxos available (BIP84)', async () => {
      const unfunded = new WalletAccountBtc(SEED_PHRASE, "0'/0/1", { ...ACCOUNT_CONFIG, bip: 84 })
      await expect(unfunded.sendTransaction({ to: recipient, value: 1_000 }))
        .rejects.toThrow('No unspent outputs available')
      unfunded.dispose()
    })
  })

  describe('toReadOnlyAccount', () => {
    test('should return a read-only copy of the account', async () => {
      const readOnlyAccount = await account.toReadOnlyAccount()
      expect(readOnlyAccount).toBeInstanceOf(WalletAccountReadOnlyBtc)
      expect(await readOnlyAccount.getAddress()).toBe(ACCOUNT_BIP44.address)
      readOnlyAccount._electrumClient.close()
    })
  })
})
