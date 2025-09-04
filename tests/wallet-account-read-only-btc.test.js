import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import { HOST, PORT, ELECTRUM_PORT, ZMQ_PORT, DATA_DIR, ACCOUNT_CONFIG } from './config.js'
import accountFixtures, { BitcoinCli, Waiter } from './helpers/index.js'

import { WalletAccountBtc, WalletAccountReadOnlyBtc } from '../index.js'

const { SEED_PHRASE, ACCOUNT_BIP84 } = accountFixtures

describe('WalletAccountReadOnlyBtc', () => {
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
    account = new WalletAccountReadOnlyBtc(ACCOUNT_BIP84.address, ACCOUNT_CONFIG)
    recipient = bitcoin.getNewAddress()
    bitcoin.sendToAddress(ACCOUNT_BIP84.address, 0.01)
    await waiter.mine()
  })

  afterAll(() => {
    account._electrumClient.close()
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

  describe('quoteSendTransaction', () => {
    test('should successfully quote a transaction', async () => {
      const TRANSACTION = {
        to: recipient,
        value: 1_000
      }

      const { fee } = await account.quoteSendTransaction(TRANSACTION)
      expect(fee).toBe(141)
    })

    test('should successfully quote a transaction', async () => {
      const writable = new WalletAccountBtc(SEED_PHRASE, "0'/0/0", ACCOUNT_CONFIG)
      const addr44 = await writable.getAddress()
      bitcoin.sendToAddress(addr44, 0.01)
      await waiter.mine()

      const roFrom44 = await writable.toReadOnlyAccount()
      const { fee } = await roFrom44.quoteSendTransaction({ to: recipient, value: 1_000 })
      expect(fee === 223).toBe(true)

      writable.dispose()
      roFrom44._electrumClient.close()
    })
  })

  describe('quoteTransfer', () => {
    test('should throw an unsupported operation error', async () => {
      await expect(account.quoteTransfer({}))
        .rejects.toThrow("The 'quoteTransfer' method is not supported on the bitcoin blockchain.")
    })
  })

  describe('getTransactionReceipt', () => {
    test('should return the correct transaction receipt for a confirmed transaction', async () => {
      const writableAccount = new WalletAccountBtc(SEED_PHRASE, "0'/0/11", ACCOUNT_CONFIG)
      const readOnlyAccount = await writableAccount.toReadOnlyAccount()

      const writableAddress = await writableAccount.getAddress()
      bitcoin.sendToAddress(writableAddress, 0.01)
      await waiter.mine()

      const recipient = bitcoin.getNewAddress()
      const { hash } = await writableAccount.sendTransaction({
        to: recipient,
        value: 1_000
      })

      await waiter.mine()

      const receipt = await readOnlyAccount.getTransactionReceipt(hash)
      expect(receipt.getId()).toBe(hash)

      const txFromCli = bitcoin.getRawTransaction(hash)
      expect(receipt.version).toBe(txFromCli.version)
      expect(receipt.locktime).toBe(txFromCli.locktime)

      for (let i = 0; i < txFromCli.vin.length; i++) {
        expect(receipt.ins[i].sequence).toBe(txFromCli.vin[i].sequence)
      }

      for (let i = 0; i < txFromCli.vout.length; i++) {
        const cliOutput = txFromCli.vout[i]
        const libOutput = receipt.outs[i]
        const valueSats = Math.round(cliOutput.value * 1e8)

        expect(libOutput.value).toBe(valueSats)
        expect(libOutput.script.toString('hex')).toBe(cliOutput.scriptPubKey.hex)
      }

      writableAccount.dispose()
      readOnlyAccount._electrumClient.close()
    })

    test('should return null for a valid txid that was never broadcasted', async () => {
      const nonExistentTxid = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

      const writableAccount = new WalletAccountBtc(SEED_PHRASE, "0'/0/12", ACCOUNT_CONFIG)
      const readOnlyAccount = await writableAccount.toReadOnlyAccount()

      const receipt = await readOnlyAccount.getTransactionReceipt(nonExistentTxid)
      expect(receipt).toBeNull()

      writableAccount.dispose()
      readOnlyAccount._electrumClient.close()
    })

    test('should throw an error for an invalid txid format', async () => {
      const invalidTxid = 'abcdef1234'

      const writableAccount = new WalletAccountBtc(SEED_PHRASE, "0'/0/13", ACCOUNT_CONFIG)
      const readOnlyAccount = await writableAccount.toReadOnlyAccount()

      await expect(readOnlyAccount.getTransactionReceipt(invalidTxid))
        .rejects.toThrow("The 'getTransactionReceipt(hash)' method requires a valid transaction hash to fetch the receipt.")

      writableAccount.dispose()
      readOnlyAccount._electrumClient.close()
    })
  })
  describe('getTransfers', () => {
    const TRANSFERS = []

    let readOnlyAccount
    let writableAccount

    async function createIncomingTransfer () {
      const address = await writableAccount.getAddress()
      const txid = bitcoin.sendToAddress(address, 0.01)
      await waiter.mine()
      const transaction = bitcoin.getTransaction(txid)
      const fee = Math.round(Math.abs(transaction.fee) * 1e8)

      return {
        txid,
        address,
        vout: transaction.details[0].vout,
        height: transaction.blockheight,
        value: 1_000_000,
        direction: 'incoming',
        fee,
        recipient: address
      }
    }

    async function createOutgoingTransfer () {
      const address = await writableAccount.getAddress()
      const recipient = bitcoin.getNewAddress()

      const { hash, fee } = await writableAccount.sendTransaction({
        to: recipient,
        value: 100_000
      })

      await waiter.mine()

      const tx = bitcoin.getTransaction(hash)

      return {
        txid: hash,
        address,
        vout: 0,
        height: tx.blockheight,
        value: 100_000,
        direction: 'outgoing',
        fee,
        recipient
      }
    }

    beforeAll(async () => {
      writableAccount = new WalletAccountBtc(SEED_PHRASE, "0'/0/10", ACCOUNT_CONFIG)

      for (let i = 0; i < 5; i++) {
        const transfer = i % 2 === 0
          ? await createIncomingTransfer()
          : await createOutgoingTransfer()
        TRANSFERS.push(transfer)
      }

      readOnlyAccount = await writableAccount.toReadOnlyAccount()
    })

    afterAll(async () => {
      writableAccount.dispose()
      readOnlyAccount._electrumClient.close()
    })

    test('should return the full transfer history', async () => {
      const transfers = await readOnlyAccount.getTransfers()
      expect(transfers).toEqual(TRANSFERS)
    })

    test('should return the incoming transfer history', async () => {
      const transfers = await readOnlyAccount.getTransfers({ direction: 'incoming' })
      expect(transfers).toEqual([TRANSFERS[0], TRANSFERS[2], TRANSFERS[4]])
    })

    test('should return the outgoing transfer history', async () => {
      const transfers = await readOnlyAccount.getTransfers({ direction: 'outgoing' })
      expect(transfers).toEqual([TRANSFERS[1], TRANSFERS[3]])
    })

    test('should correctly paginate the transfer history', async () => {
      const transfers = await readOnlyAccount.getTransfers({ limit: 2, skip: 1 })
      expect(transfers).toEqual([TRANSFERS[1], TRANSFERS[2]])
    })

    test('should correctly filter and paginate the transfer history', async () => {
      const transfers = await readOnlyAccount.getTransfers({ limit: 2, skip: 1, direction: 'incoming' })
      expect(transfers).toEqual([TRANSFERS[2], TRANSFERS[4]])
    })
  })
})
