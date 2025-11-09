import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import { HOST, PORT, ELECTRUM_PORT, ZMQ_PORT, DATA_DIR } from './config.js'

import { BitcoinCli, Waiter } from './helpers/index.js'

import { WalletAccountReadOnlyBtc } from '../index.js'

const ADDRESSES = {
  44: 'mfXn8RBVY9dNiggLAX8oFdjbYk8UNZi8La',
  84: 'bcrt1q56sfepv68sf2xfm2kgk3ea2mdjzswljl3r3tdx'
}

export const FEES = {
  44: 223n,
  84: 141n
}

describe.each([44, 84])('WalletAccountReadOnlyBtc', (bip) => {
  const CONFIGURATION = {
    host: HOST,
    port: ELECTRUM_PORT,
    network: 'regtest',
    bip
  }

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
    account = new WalletAccountReadOnlyBtc(ADDRESSES[bip], CONFIGURATION)
    recipient = bitcoin.getNewAddress()

    bitcoin.sendToAddress(ADDRESSES[bip], 0.01)

    await waiter.mine()
  })

  afterAll(async () => {
    account._electrumClient.close()
  })

  describe('getBalance', () => {
    test('should return the correct balance of the account', async () => {
      const balance = await account.getBalance()

      expect(balance).toBe(1_000_000n)
    })
  })

  describe('getTokenBalance', () => {
    test('should throw an unsupported operation error', async () => {
      await expect(account.getTokenBalance('...'))
        .rejects.toThrow("The 'getTokenBalance' method is not supported on the bitcoin blockchain.")
    })
  })

  describe('getMaxSpendable', () => {
    const TX_OVERHEAD_VBYTES = 11
    const OUTPUT_VBYTES = 34
    const MIN_TX_FEE = 141
    const STARTING_BALANCE = 1_000_000n
    const INPUT_VBYTES = bip === 44 ? 148 : 68

    test('should return the correct maximum spendable amount', async () => {
      const satsPerVByte = bitcoin.estimateSatsPerVByte(1)

      const vsize = TX_OVERHEAD_VBYTES + INPUT_VBYTES + (2 * OUTPUT_VBYTES)
      const expectedFee = BigInt(Math.max(Math.ceil(vsize * satsPerVByte), MIN_TX_FEE))
      const dustLimit = account._dustLimit
      const expectedAmount = STARTING_BALANCE - expectedFee - dustLimit

      const result = await account.getMaxSpendable()

      expect(result).toEqual({
        amount: expectedAmount,
        fee: expectedFee,
        changeValue: dustLimit
      })
    })

    test('should return correct max spend when change would be dust (one output)', async () => {
      const satsPerVByte = bitcoin.estimateSatsPerVByte(1)

      const tmpAddress = bip === 44
        ? bitcoin.call('getnewaddress "" legacy', { rawResult: true })
        : bitcoin.call('getnewaddress "" bech32', { rawResult: true })
      const tmpAccount = new WalletAccountReadOnlyBtc(tmpAddress, CONFIGURATION)
      const dustLimit = Number(tmpAccount._dustLimit)

      const vsizeOneOutput = TX_OVERHEAD_VBYTES + INPUT_VBYTES + OUTPUT_VBYTES
      const feeOneOutput = Math.max(Math.ceil(vsizeOneOutput * satsPerVByte), MIN_TX_FEE)

      const vsizeTwoOutputs = TX_OVERHEAD_VBYTES + INPUT_VBYTES + (2 * OUTPUT_VBYTES)
      const feeTwoOutputs = Math.max(Math.ceil(vsizeTwoOutputs * satsPerVByte), MIN_TX_FEE)

      const minSpendable = feeOneOutput + dustLimit + 1
      const maxSpendable = feeTwoOutputs + 2 * dustLimit

      const oneOutputRange = Math.max(1, maxSpendable - minSpendable)

      const fundedAmount = minSpendable + Math.min(1000, oneOutputRange - 1)

      bitcoin.sendToAddress(tmpAddress, (fundedAmount / 1e8).toFixed(8))
      await waiter.mine()

      const result = await tmpAccount.getMaxSpendable()

      expect(result).toEqual({
        amount: BigInt(fundedAmount - feeOneOutput),
        fee: BigInt(feeOneOutput),
        changeValue: 0n
      })

      tmpAccount._electrumClient.close()
    })
  })

  describe('quoteSendTransaction', () => {
    test('should successfully quote a transaction', async () => {
      const TRANSACTION = { to: recipient, value: 1_000 }

      const { fee } = await account.quoteSendTransaction(TRANSACTION)

      const satsPerVByte = bitcoin.estimateSatsPerVByte(1)
      const expectedFee = FEES[bip] * BigInt(satsPerVByte)
      expect(fee).toBe(expectedFee)
    })
    
    test('should successfully quote a transaction (bigint)', async () => {
      const TRANSACTION = { to: recipient, value: 1_000n }

      const { fee } = await account.quoteSendTransaction(TRANSACTION)

      const satsPerVByte = bitcoin.estimateSatsPerVByte(1)
      const expectedFee = FEES[bip] * BigInt(satsPerVByte)
      expect(fee).toBe(expectedFee)
    })

    test('should successfully quote a transaction with a fixed fee rate', async () => {
      const TRANSACTION = { to: recipient, value: 1_000, feeRate: 10 }

      const { fee } = await account.quoteSendTransaction(TRANSACTION)
      
      const expectedFee = FEES[bip] * BigInt(TRANSACTION.feeRate)
      expect(fee).toBe(expectedFee)
    })
  
    test('should successfully quote a transaction with a fixed fee rate (bigint)', async () => {
      const TRANSACTION = { to: recipient, value: 1000, feeRate: 10n }

      const { fee } = await account.quoteSendTransaction(TRANSACTION)
      
      const expectedFee = FEES[bip] * TRANSACTION.feeRate
      expect(fee).toBe(expectedFee)
    })
    
    test('should successfully quote a transaction with confirmation target', async () => {
      const TRANSACTION = { to: recipient, value: 1000, cofnirmationTarget: 5 }

      const { fee } = await account.quoteSendTransaction(TRANSACTION)
      const satsPerVByte = bitcoin.estimateSatsPerVByte(5)
      const expectedFee = FEES[bip] * BigInt(satsPerVByte)
      expect(fee).toBe(expectedFee)
    })
  })

  describe('quoteTransfer', () => {
    test('should throw an unsupported operation error', async () => {
      await expect(account.quoteTransfer({}))
        .rejects.toThrow("The 'quoteTransfer' method is not supported on the bitcoin blockchain.")
    })
  })
})
