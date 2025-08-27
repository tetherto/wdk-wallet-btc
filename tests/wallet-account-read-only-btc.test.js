import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import { HOST, PORT, ELECTRUM_PORT, ZMQ_PORT, DATA_DIR, ACCOUNT_CONFIG } from './config.js'
import accountFixtures, { BitcoinCli, Waiter } from './helpers/index.js'

import { WalletAccountBtc, WalletAccountReadOnlyBtc } from '../index.js'

const { SEED_PHRASE, getBtcAccount } = accountFixtures

const ACCOUNT_RO = getBtcAccount(0)

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
    account = new WalletAccountReadOnlyBtc(ACCOUNT_RO.address, ACCOUNT_CONFIG)
    recipient = bitcoin.getNewAddress()
    bitcoin.sendToAddress(ACCOUNT_RO.address, 0.01)
    await waiter.mine()
  })

  afterAll(async () => {
    await account._electrumClient.close()
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
  })

  describe('quoteTransfer', () => {
    test('should throw an unsupported operation error', async () => {
      await expect(account.quoteTransfer({}))
        .rejects.toThrow("The 'quoteTransfer' method is not supported on the bitcoin blockchain.")
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
      await readOnlyAccount._electrumClient.close()
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
