import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import { mnemonicToSeedSync } from 'bip39'

import { HOST, PORT, ELECTRUM_PORT, ZMQ_PORT, DATA_DIR } from './config.js'

import { BitcoinCli, Waiter } from './helpers/index.js'

import { WalletAccountBtc } from '../index.js'

const SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'
const INVALID_SEED_PHRASE = 'invalid seed phrase'
const SEED = mnemonicToSeedSync(SEED_PHRASE)

const ACCOUNT = {
  index: 0,
  path: "m/84'/0'/0'/0/0",
  address: 'bcrt1qxn0te9ecv864wtu53cccjhuuy5dphvemjt58ge',
  keyPair: {
    privateKey: '433c8e1e0064cdafe991f1efb4803d7dfcc2533db7d5cfa963ed53917b720248',
    publicKey: '035a48902f37c03901f36fea0a06aef2be29d9c55da559f5bd02c2d02d2b516382'
  }
}

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

    bitcoin.sendToAddress(ACCOUNT.address, 0.01)

    await waiter.mine()
  })

  afterAll(() => {
    account.dispose()
  })

  describe('constructor', () => {
    test('should successfully initialize an account for the given seed phrase and path', () => {
      const account = new WalletAccountBtc(SEED_PHRASE, "0'/0/0")

      expect(account.index).toBe(ACCOUNT.index)

      expect(account.path).toBe(ACCOUNT.path)

      expect(account.keyPair).toEqual({
        privateKey: new Uint8Array(Buffer.from(ACCOUNT.keyPair.privateKey, 'hex')),
        publicKey: new Uint8Array(Buffer.from(ACCOUNT.keyPair.publicKey, 'hex'))
      })
    })

    test('should successfully initialize an account for the given seed and path', () => {
      const account = new WalletAccountBtc(SEED, "0'/0/0")

      expect(account.index).toBe(ACCOUNT.index)

      expect(account.path).toBe(ACCOUNT.path)

      expect(account.keyPair).toEqual({
        privateKey: new Uint8Array(Buffer.from(ACCOUNT.keyPair.privateKey, 'hex')),
        publicKey: new Uint8Array(Buffer.from(ACCOUNT.keyPair.publicKey, 'hex'))
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
  })

  describe('getAddress', () => {
    test('should return the correct address', async () => {
      const result = await account.getAddress()

      expect(result).toBe(ACCOUNT.address)
    })
  })

  describe('sign', () => {
    const MESSAGE = 'Dummy message to sign.'

    const EXPECTED_SIGNATURE = 'd70594939c4e5fc68694fd09c42aabccb715a22f88eb0a84dc333410236a76ee6061f863a86094bb3858ca44be048675516b02fd46dd3b6a23e2255367a44509'

    test('should return the correct signature', async () => {
      const signature = await account.sign(MESSAGE)

      expect(signature).toBe(EXPECTED_SIGNATURE)
    })
  })

  describe('verify', () => {
    const MESSAGE = 'Dummy message to sign.'

    const SIGNATURE = 'd70594939c4e5fc68694fd09c42aabccb715a22f88eb0a84dc333410236a76ee6061f863a86094bb3858ca44be048675516b02fd46dd3b6a23e2255367a44509'

    test('should return true for a valid signature', async () => {
      const result = await account.verify(MESSAGE, SIGNATURE)

      expect(result).toBe(true)
    })

    test('should return false for an invalid signature', async () => {
      const result = await account.verify('Another message.', SIGNATURE)

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

      expect(fee).toBe(141)
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

      expect(transfers).toEqual(TRANSFERS)
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
