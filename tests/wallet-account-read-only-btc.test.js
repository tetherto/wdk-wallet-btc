import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import { HOST, PORT, ELECTRUM_PORT, ZMQ_PORT, DATA_DIR } from './config.js'

import { BitcoinCli, Waiter } from './helpers/index.js'

import { WalletAccountReadOnlyBtc } from '../index.js'
import { NoSuchElementError, UnsupportedOperationError, ValueError } from '@tetherto/wdk-wallet'

const ADDRESSES = {
  // 0'/0/404
  legacy: 'mpAchHfVmLYViwscV2FSUC9s5U7bKkGfui',
  // 0'/0/404
  segwit: 'bcrt1qruhppa4atdlgj5cq5vxwe7aqym6aa8su82099f'
}

const MESSAGE = 'Dummy message to sign.'

const SIGNATURES = {
  legacy: 'ILWuWH2g27UaXIsSw0UFLQYwfUOWfvRNXvScHE4BCk8aNm4KMm3JkscALgNhispNXVRrSOPRAJUM57ZhOHwZQSI=',
  segwit: 'JwLv90xAF4LXLArn6IAnYoitRukE9bxa0PdCu1IzPB9dIb6A6/PLXSunegUReDy6UoyvVodVHAtBbMnETP9hqf4='
}

export const FEES = {
  legacy: 223n,
  segwit: 141n
}

const DUST_LIMITS = {
  legacy: 546,
  segwit: 297
}

const ADDRESS_TYPES = {
  legacy: 'legacy',
  segwit: 'bech32'
}

describe.each(['legacy', 'segwit'])('WalletAccountReadOnlyBtc (%s)', (type) => {
  const CONFIGURATION = {
    client: { type: 'electrum', clientConfig: { host: HOST, port: ELECTRUM_PORT } },
    network: 'regtest'
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
    account = new WalletAccountReadOnlyBtc(ADDRESSES[type], CONFIGURATION)
    recipient = bitcoin.getNewAddress()

    bitcoin.sendToAddress(ADDRESSES[type], 0.01)

    await waiter.mine()
  })

  afterAll(async () => {
    account.dispose()
  })

  describe('getBalance', () => {
    test('should return the correct balance of the account', async () => {
      const balance = await account.getBalance()

      expect(balance).toBe(1_000_000n)
    })
  })

  describe('getTokenBalance', () => {
    test('should throw an unsupported operation error', async () => {
      const promise = account.getTokenBalance('...')

      await expect(promise).rejects.toThrow(UnsupportedOperationError)
      await expect(promise).rejects.toThrow("Method 'getTokenBalance(tokenAddress)' is not supported.")
    })
  })

  describe('getMaxSpendable', () => {
    const TX_OVERHEAD_VBYTES = 11
    const OUTPUT_VBYTES = 34
    const MIN_TX_FEE = 141
    const STARTING_BALANCE = 1_000_000n
    const INPUT_VBYTES = type === 'legacy' ? 148 : 68

    test('should return the correct maximum spendable amount', async () => {
      const satsPerVByte = bitcoin.estimateSatsPerVByte(1)

      const vsize = TX_OVERHEAD_VBYTES + INPUT_VBYTES + (2 * OUTPUT_VBYTES)
      const expectedFee = BigInt(Math.max(Math.ceil(vsize * satsPerVByte), MIN_TX_FEE))
      const dustLimit = type === 'legacy' ? 546n : 297n
      const expectedAmount = STARTING_BALANCE - expectedFee - dustLimit

      const result = await account.getMaxSpendable({ feeRate: satsPerVByte })

      expect(result).toEqual({
        amount: expectedAmount,
        fee: expectedFee,
        changeValue: dustLimit
      })
    })

    test('should return correct max spend when change would be dust (one output)', async () => {
      const satsPerVByte = bitcoin.estimateSatsPerVByte(1)

      const tmpAddress = type === 'legacy'
        ? bitcoin.call('getnewaddress "" legacy', { rawResult: true })
        : bitcoin.call('getnewaddress "" bech32', { rawResult: true })
      const tmpAccount = new WalletAccountReadOnlyBtc(tmpAddress, CONFIGURATION)
      const dustLimit = type === 'legacy' ? 546 : 297

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

      const result = await tmpAccount.getMaxSpendable({ feeRate: satsPerVByte })

      expect(result).toEqual({
        amount: BigInt(fundedAmount - feeOneOutput),
        fee: BigInt(feeOneOutput),
        changeValue: 0n
      })

      tmpAccount._client.close()
    })

    describe('with a single output', () => {
      const FEE_ONE_OUTPUT = Math.max(TX_OVERHEAD_VBYTES + INPUT_VBYTES + OUTPUT_VBYTES, MIN_TX_FEE)

      const fundNewAccount = async (sats, addressType = ADDRESS_TYPES[type]) => {
        const address = bitcoin.call(`getnewaddress "" ${addressType}`, { rawResult: true })
        bitcoin.sendToAddress(address, (sats / 1e8).toFixed(8))
        await waiter.mine()

        return new WalletAccountReadOnlyBtc(address, CONFIGURATION)
      }

      test('should return an amount equal to the recipient dust limit', async () => {
        const to = bitcoin.call(`getnewaddress "" ${ADDRESS_TYPES[type]}`, { rawResult: true })
        const tmpAccount = await fundNewAccount(FEE_ONE_OUTPUT + DUST_LIMITS[type])

        const result = await tmpAccount.getMaxSpendable({ to, feeRate: 1 })

        expect(result).toEqual({
          amount: BigInt(DUST_LIMITS[type]),
          fee: BigInt(FEE_ONE_OUTPUT),
          changeValue: 0n
        })

        tmpAccount._client.close()
      })

      test('should return zero if the amount is one satoshi below the recipient dust limit', async () => {
        const to = bitcoin.call(`getnewaddress "" ${ADDRESS_TYPES[type]}`, { rawResult: true })
        const tmpAccount = await fundNewAccount(FEE_ONE_OUTPUT + DUST_LIMITS[type] - 1)

        const result = await tmpAccount.getMaxSpendable({ to, feeRate: 1 })

        expect(result).toEqual({ amount: 0n, fee: 0n, changeValue: 0n })

        tmpAccount._client.close()
      })

      test('should use the dust limit of the recipient address if to is passed', async () => {
        const to = bitcoin.call('getnewaddress "" bech32', { rawResult: true })
        const tmpAccount = await fundNewAccount(MIN_TX_FEE + 297, 'bech32')

        const result = await tmpAccount.getMaxSpendable({ to, feeRate: 1 })

        expect(result).toEqual({
          amount: 297n,
          fee: BigInt(MIN_TX_FEE),
          changeValue: 0n
        })

        tmpAccount._client.close()
      })

      test('should assume the highest dust limit if to is omitted', async () => {
        const tmpAccount = await fundNewAccount(FEE_ONE_OUTPUT + 545)

        const result = await tmpAccount.getMaxSpendable({ feeRate: 1 })

        expect(result).toEqual({ amount: 0n, fee: 0n, changeValue: 0n })

        tmpAccount._client.close()
      })
    })
  })

  describe('quoteSendTransaction', () => {
    test('should successfully quote a transaction', async () => {
      const satsPerVByte = bitcoin.estimateSatsPerVByte(1)
      const TRANSACTION = { to: recipient, value: 1_000, feeRate: satsPerVByte }

      const { fee } = await account.quoteSendTransaction(TRANSACTION)

      const expectedFee = FEES[type] * BigInt(satsPerVByte)
      expect(fee).toBe(expectedFee)
    })

    test('should successfully quote a transaction (bigint)', async () => {
      const satsPerVByte = bitcoin.estimateSatsPerVByte(1)
      const TRANSACTION = { to: recipient, value: 1_000n, feeRate: satsPerVByte }

      const { fee } = await account.quoteSendTransaction(TRANSACTION)

      const expectedFee = FEES[type] * BigInt(satsPerVByte)
      expect(fee).toBe(expectedFee)
    })

    test('should successfully quote a transaction with a fixed fee rate', async () => {
      const TRANSACTION = { to: recipient, value: 1_000, feeRate: 10 }

      const { fee } = await account.quoteSendTransaction(TRANSACTION)
      
      const expectedFee = FEES[type] * BigInt(TRANSACTION.feeRate)
      expect(fee).toBe(expectedFee)
    })
  
    test('should successfully quote a transaction with confirmation target', async () => {
      const satsPerVByte = bitcoin.estimateSatsPerVByte(5)
      const TRANSACTION = { to: recipient, value: 1000, feeRate: satsPerVByte }

      const { fee } = await account.quoteSendTransaction(TRANSACTION)
      const expectedFee = FEES[type] * BigInt(satsPerVByte)
      expect(fee).toBe(expectedFee)
    })
  })

  describe('quoteTransfer', () => {
    test('should throw an unsupported operation error', async () => {
      const promise = account.quoteTransfer({})

      await expect(promise).rejects.toThrow(UnsupportedOperationError)
      await expect(promise).rejects.toThrow("Method 'quoteTransfer(options)' is not supported.")
    })
  })

  describe('getTransaction', () => {
    let txid

    beforeAll(() => {
      txid = bitcoin.sendToAddress(ADDRESSES[type], 0.005)
    })

    test('should report pending for an unconfirmed transaction', async () => {
      let info = null
      const start = Date.now()

      while (Date.now() - start < 15_000) {
        try {
          info = await account.getTransaction(txid)
          break
        } catch (err) {
          if (!(err instanceof NoSuchElementError)) throw err
        }
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      expect(info).not.toBeNull()
      expect(info.finality).toBe('pending')
      expect(info.success).toBeUndefined()
      expect(info.confirmations).toBe(0)
      expect(info.transaction).toBeDefined()
    })

    test('should report confirmed after one confirmation', async () => {
      await waiter.mine(1)

      const info = await account.getTransaction(txid)

      expect(info.finality).toBe('confirmed')
      expect(info.success).toBe(true)
      expect(info.confirmations).toBe(1)
      expect(typeof info.block).toBe('number')
      expect(info.transaction).toBeDefined()
    })

    test('should report final after six confirmations', async () => {
      await waiter.mine(5)

      const info = await account.getTransaction(txid)

      expect(info.finality).toBe('final')
      expect(info.confirmations).toBeGreaterThanOrEqual(6)
    })

    test('should throw NoSuchElementError for an unknown transaction', async () => {
      await expect(account.getTransaction('f'.repeat(64))).rejects.toThrow(NoSuchElementError)
    })

    test('should throw ValueError on a malformed transaction hash', async () => {
      await expect(account.getTransaction('not-a-hash'))
        .rejects.toThrow(ValueError)
    })
  })

  describe('verify', () => {
    test('should return true for a valid signature', async () => {
        const result = await account.verify(MESSAGE, SIGNATURES[type])
        expect(result).toBe(true)
    })

    test('should return false for an invalid signature', async () => {
      const result = await account.verify('Another message.', SIGNATURES[type])
      expect(result).toBe(false)
    })

    test('should throw on a malformed signature', async () => {
      await expect(account.verify(MESSAGE, 'A bad signature'))
        .rejects.toThrow('Invalid signature')
    })
  })
})

describe('WalletAccountReadOnlyBtc getBalance formula', () => {
  function stubClient (balance) {
    return {
      connect: async () => {},
      getBalance: async () => balance
    }
  }

  test('should subtract unconfirmedOutgoing when the client reports it', async () => {
    const account = new WalletAccountReadOnlyBtc(ADDRESSES.segwit, {
      network: 'regtest',
      client: stubClient({ confirmed: 100_000, unconfirmed: 999_999, unconfirmedOutgoing: 30_000 })
    })

    const balance = await account.getBalance()

    expect(balance).toBe(70_000n)
  })

  test('should fall back to netting the raw unconfirmed balance when the client does not report unconfirmedOutgoing', async () => {
    const account = new WalletAccountReadOnlyBtc(ADDRESSES.segwit, {
      network: 'regtest',
      client: stubClient({ confirmed: 100_000, unconfirmed: -30_000 })
    })

    const balance = await account.getBalance()

    expect(balance).toBe(70_000n)
  })
})
