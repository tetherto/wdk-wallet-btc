import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import { mnemonicToSeedSync } from 'bip39'

import { HOST, PORT, ELECTRUM_PORT, ZMQ_PORT, DATA_DIR } from './config.js'

import { BitcoinCli, Waiter } from './helpers/index.js'

import { WalletAccountBtc } from '../index.js'

const SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'
const INVALID_SEED_PHRASE = 'invalid seed phrase'
const SEED = mnemonicToSeedSync(SEED_PHRASE)

const ACCOUNT_BIP84 = {
  index: 0,
  path: "m/84'/0'/0'/0/0",
  address: 'bcrt1qxn0te9ecv864wtu53cccjhuuy5dphvemjt58ge',
  keyPair: {
    privateKey: '433c8e1e0064cdafe991f1efb4803d7dfcc2533db7d5cfa963ed53917b720248',
    publicKey: '035a48902f37c03901f36fea0a06aef2be29d9c55da559f5bd02c2d02d2b516382'
  }
}

const ACCOUNT_BIP44 = {
  index: 0,
  path: "m/44'/0'/0'/0/0",
  address: 'mjWcNW3MnJdb6ihYRmyoywL4xm4a7n4JYH',
  keyPair: {
    privateKey: 'd405730e81abfd3c50de982134b2117469915df4b03dc2827fd646410485c148',
    publicKey: '03c061f44a568ab1b16db34b9bef4eeb21b75bb25fcd3af48e4eb60313fc99c86b'
  }
}

const SIGNATURE_BIP44 = '13287d7e5a924bf2c7e10bb78977925d17dd765ac9ff79eb774d77b0a7caccfc6173463d4845d74c3c8c97a76352f203643e958cc4d8732744be4f9d961eb4db'

const CONFIGURATION = {
  host: HOST,
  port: ELECTRUM_PORT,
  network: 'regtest'
}

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
    account = new WalletAccountBtc(SEED_PHRASE, "0'/0/0", CONFIGURATION)
    recipient = bitcoin.getNewAddress()
    bitcoin.sendToAddress(ACCOUNT_BIP44.address, 0.01)

    await waiter.mine()
  })

  afterAll(() => {
    account.dispose()
  })

  describe('constructor', () => {
    test('should successfully initialize an account for the given seed phrase and path', () => {
      const account = new WalletAccountBtc(SEED_PHRASE, "0'/0/0")

      expect(account.index).toBe(ACCOUNT_BIP44.index)

      expect(account.path).toBe(ACCOUNT_BIP44.path)

      expect(account.keyPair).toEqual({
        privateKey: new Uint8Array(Buffer.from(ACCOUNT_BIP44.keyPair.privateKey, 'hex')),
        publicKey: new Uint8Array(Buffer.from(ACCOUNT_BIP44.keyPair.publicKey, 'hex'))
      })
    })

    test('should successfully initialize an account for the given seed and path', () => {
      const account = new WalletAccountBtc(SEED, "0'/0/0")

      expect(account.index).toBe(ACCOUNT_BIP44.index)

      expect(account.path).toBe(ACCOUNT_BIP44.path)

      expect(account.keyPair).toEqual({
        privateKey: new Uint8Array(Buffer.from(ACCOUNT_BIP44.keyPair.privateKey, 'hex')),
        publicKey: new Uint8Array(Buffer.from(ACCOUNT_BIP44.keyPair.publicKey, 'hex'))
      })
    })

    test('should successfully initialize an account for the given seed and path (bip-84)', () => {
      const account = new WalletAccountBtc(SEED, "0'/0/0", { bip: 84 })

      expect(account.index).toBe(ACCOUNT_BIP84.index)

      expect(account.path).toBe(ACCOUNT_BIP84.path)

      expect(account.keyPair).toEqual({
        privateKey: new Uint8Array(Buffer.from(ACCOUNT_BIP84.keyPair.privateKey, 'hex')),
        publicKey: new Uint8Array(Buffer.from(ACCOUNT_BIP84.keyPair.publicKey, 'hex'))
      })
    })

    test('should throw if the seed phrase is invalid', () => {
      // eslint-disable-next-line no-new
      expect(() => new WalletAccountBtc(INVALID_SEED_PHRASE, "0'/0/0"))
        .toThrow('The seed phrase is invalid.')
    })

    test('should throw if the path is invalid', () => {
      // eslint-disable-next-line no-new
      expect(() => new WalletAccountBtc(SEED_PHRASE, "a'/b/c"))
        .toThrow(/Expected BIP32Path/)
    })

    test('should throw for unsupported bip type', () => {
      // eslint-disable-next-line no-new
      expect(() => new WalletAccountBtc(SEED_PHRASE, "0'/0/0", { bip: 33 }))
        .toThrow(/Unsupported BIP type/)
    })
  })

  describe('getAddress', () => {
    test('should return the correct address', async () => {
      const result = await account.getAddress()

      expect(result).toBe(ACCOUNT_BIP44.address)
    })
  })

  describe('sign', () => {
    const MESSAGE = 'Dummy message to sign.'

    test('should return the correct signature', async () => {
      const signature = await account.sign(MESSAGE)

      expect(signature).toBe(SIGNATURE_BIP44)
    })
  })

  describe('verify', () => {
    const MESSAGE = 'Dummy message to sign.'

    test('should return true for a valid signature', async () => {
      const result = await account.verify(MESSAGE, SIGNATURE_BIP44)

      expect(result).toBe(true)
    })

    test('should return false for an invalid signature', async () => {
      const result = await account.verify('Another message.', SIGNATURE_BIP44)

      expect(result).toBe(false)
    })

    test('should throw on a malformed signature', async () => {
      await expect(account.verify(MESSAGE, 'A bad signature'))
        .rejects.toThrow('Expected Signature')
    })
  })

  describe('getBalance', () => {
    test('should return the correct balance of the account', async () => {
      const balance = await account.getBalance()

      expect(balance).toBe(1_000_000)
    })
  })

  describe('getTokenBalance', () => {
    test('should throw an unsupported operation error', async () => {
      await expect(account.getTokenBalance('...'))
        .rejects.toThrow("The 'getTokenBalance' method is not supported on the bitcoin blockchain.")
    })
  })

  describe('sendTransaction', () => {
    test('should successfully send a transaction', async () => {
      const TRANSACTION = {
        to: recipient,
        value: 1_000
      }

      const { hash, fee } = await account.sendTransaction(TRANSACTION)

      const { fees } = bitcoin.getMempoolEntry(hash)
      const baseFee = Math.round(fees.base * 1e+8)
      expect(fee).toBe(baseFee)

      const transaction = bitcoin.getTransaction(hash)
      expect(transaction.txid).toBe(hash)
      expect(transaction.details[0].address).toBe(TRANSACTION.to)

      const amount = Math.round(transaction.details[0].amount * 1e+8)
      expect(amount).toBe(TRANSACTION.value)
    })

    test('should throw if value is less than the dust limit', async () => {
      await expect(account.sendTransaction({ to: recipient, value: 500 }))
        .rejects.toThrow('The amount must be bigger than the dust limit')
    })

    test('should throw if the account balance does not cover the transaction costs', async () => {
      await expect(account.sendTransaction({ to: recipient, value: 1_000_000_000_000 }))
        .rejects.toThrow('Insufficient balance to send the transaction')
    })

    test('should throw if there an no utxos available', async () => {
      const account = new WalletAccountBtc(SEED_PHRASE, "0'/0/1", CONFIGURATION)

      await expect(account.sendTransaction({ to: recipient, value: 1_000 }))
        .rejects.toThrow('No unspent outputs available')

      account.dispose()
    })
  })

  describe('quoteSendTransaction', () => {
    test('should successfully quote a transaction', async () => {
      const TRANSACTION = {
        to: recipient,
        value: 1_000
      }

      const { fee } = await account.quoteSendTransaction(TRANSACTION)

      expect(fee === 223 || fee === 222).toBe(true)
    })
  })

  describe('transfer', () => {
    test('should throw an unsupported operation error', async () => {
      await expect(account.transfer({}))
        .rejects.toThrow("The 'transfer' method is not supported on the bitcoin blockchain.")
    })
  })

  describe('quoteTransfer', () => {
    test('should throw an unsupported operation error', async () => {
      await expect(account.quoteTransfer({}))
        .rejects.toThrow("The 'quoteTransfer' method is not supported on the bitcoin blockchain.")
    })
  })

  describe('getTransfers', () => {
    const TRANSFERS = []

    let account

    async function createIncomingTransfer (value) {
      const address = await account.getAddress()
      const txid = bitcoin.sendToAddress(address, 0.01)
      await waiter.mine()

      const transaction = bitcoin.getTransaction(txid)
      const fee = Math.round(Math.abs(transaction.fee) * 1e+8)

      const height = bitcoin.getBlockCount()

      return {
        txid,
        address,
        vout: transaction.details[0].vout,
        height,
        value: 1_000_000,
        direction: 'incoming',
        fee,
        recipient: address
      }
    }

    async function createOutgoingTransfer () {
      const address = await account.getAddress()

      const recipient = bitcoin.getNewAddress()

      const { hash, fee } = await account.sendTransaction({
        to: recipient,
        value: 100_000
      })

      await waiter.mine()

      const height = bitcoin.getBlockCount()

      return {
        txid: hash,
        address,
        vout: 0,
        height,
        value: 100_000,
        direction: 'outgoing',
        fee,
        recipient
      }
    }

    beforeAll(async () => {
      account = new WalletAccountBtc(SEED_PHRASE, "0'/0/1", CONFIGURATION)

      for (let i = 0; i < 5; i++) {
        const transfer = i % 2 === 0
          ? await createIncomingTransfer()
          : await createOutgoingTransfer()

        TRANSFERS.push(transfer)
      }
    })

    afterAll(() => {
      account.dispose()
    })

    test('should return the full transfer history', async () => {
      const transfers = await account.getTransfers()

      const sortedTransfers = transfers.sort((a, b) => a.height - b.height)
      const sortedExpected = TRANSFERS.sort((a, b) => a.height - b.height)

      expect(sortedTransfers).toEqual(sortedExpected)
    })

    test('should return the incoming transfer history', async () => {
      const transfers = await account.getTransfers({ direction: 'incoming' })

      expect(transfers).toEqual([TRANSFERS[0], TRANSFERS[2], TRANSFERS[4]])
    })

    test('should return the outgoing transfer history', async () => {
      const transfers = await account.getTransfers({ direction: 'outgoing' })

      expect(transfers).toEqual([TRANSFERS[1], TRANSFERS[3]])
    })

    test('should correctly paginate the transfer history', async () => {
      const transfers = await account.getTransfers({ limit: 2, skip: 1 })

      expect(transfers).toEqual([TRANSFERS[1], TRANSFERS[2]])
    })

    test('should correctly filter and paginate the transfer history', async () => {
      const transfers = await account.getTransfers({ limit: 2, skip: 1, direction: 'incoming' })

      expect(transfers).toEqual([TRANSFERS[2], TRANSFERS[4]])
    })
  })
})
