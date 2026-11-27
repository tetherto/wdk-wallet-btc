import { afterAll, afterEach, beforeAll, describe, expect, test } from '@jest/globals'

import { HOST, PORT, ELECTRUM_PORT, ZMQ_PORT, DATA_DIR } from './config.js'

import { BitcoinCli, Waiter } from './helpers/index.js'
import { sweepFee } from './helpers/utils.js'

import { WalletAccountReadOnlyBtc } from '../index.js'
import { AssertionError, NoSuchElementError, UnsupportedOperationError, ValueError } from '@tetherto/wdk-wallet'
import { networks, Transaction } from 'bitcoinjs-lib'


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
    const network = networks.regtest
    const STARTING_BALANCE = 1_000_000n

    // The test addresses belong to the node's wallet, so lock their UTXOs to stop later sends from spending them
    const lockUtxosOf = (address) => {
      const outpoints = bitcoin.call(`listunspent 1 9999999 '["${address}"]'`).map(({ txid, vout }) => ({ txid, vout }))

      bitcoin.call(`lockunspent false '${JSON.stringify(outpoints)}'`)
    }

    const tmpAccounts = []

    // Accounts are disposed after each test, so a failing test can't leave a client reconnecting
    const createTmpAccount = (address) => {
      const tmpAccount = new WalletAccountReadOnlyBtc(address, CONFIGURATION)
      tmpAccounts.push(tmpAccount)

      return tmpAccount
    }

    afterEach(() => {
      tmpAccounts.splice(0).forEach(tmpAccount => tmpAccount.dispose())
    })

    const fundNewAccount = async (sats, addressType = ADDRESS_TYPES[type]) => {
      const address = bitcoin.call(`getnewaddress "" ${addressType}`, { rawResult: true })
      bitcoin.sendToAddress(address, (sats / 1e8).toFixed(8))
      await waiter.mine()

      return createTmpAccount(address)
    }

    test('should return the correct maximum spendable amount', async () => {
      const satsPerVByte = bitcoin.estimateSatsPerVByte(1)

      const expectedFee = sweepFee({ from: ADDRESSES[type], to: ADDRESSES[type], network, feeRate: satsPerVByte })

      const result = await account.getMaxSpendable({ feeRate: satsPerVByte })

      expect(result).toEqual({
        amount: STARTING_BALANCE - expectedFee,
        fee: expectedFee,
        changeValue: 0n
      })
    })

    test('should return an amount equal to the recipient dust limit', async () => {
      const to = bitcoin.call(`getnewaddress "" ${ADDRESS_TYPES[type]}`, { rawResult: true })
      const fee = sweepFee({ from: ADDRESSES[type], to, network })
      const tmpAccount = await fundNewAccount(Number(fee) + DUST_LIMITS[type])

      const result = await tmpAccount.getMaxSpendable({ to, feeRate: 1 })

      expect(result).toEqual({
        amount: BigInt(DUST_LIMITS[type]),
        fee,
        changeValue: 0n
      })
    })

    test('should return zero if the amount is one satoshi below the recipient dust limit', async () => {
      const to = bitcoin.call(`getnewaddress "" ${ADDRESS_TYPES[type]}`, { rawResult: true })
      const fee = sweepFee({ from: ADDRESSES[type], to, network })
      const tmpAccount = await fundNewAccount(Number(fee) + DUST_LIMITS[type] - 1)

      const result = await tmpAccount.getMaxSpendable({ to, feeRate: 1 })

      expect(result).toEqual({ amount: 0n, fee: 0n, changeValue: 0n })
    })

    describe.each([
      ['P2SH', 'p2sh-segwit', 540],
      ['P2TR', 'bech32m', 333]
    ])('with a %s recipient', (_, addressType, dustLimit) => {
      test('should return an amount equal to the recipient dust limit', async () => {
        const to = bitcoin.call(`getnewaddress "" ${addressType}`, { rawResult: true })
        const fee = sweepFee({ from: ADDRESSES[type], to, network })
        const tmpAccount = await fundNewAccount(Number(fee) + dustLimit)

        const result = await tmpAccount.getMaxSpendable({ to, feeRate: 1 })

        expect(result).toEqual({ amount: BigInt(dustLimit), fee, changeValue: 0n })
      })

      test('should return zero if the amount is one satoshi below the recipient dust limit', async () => {
        const to = bitcoin.call(`getnewaddress "" ${addressType}`, { rawResult: true })
        const fee = sweepFee({ from: ADDRESSES[type], to, network })
        const tmpAccount = await fundNewAccount(Number(fee) + dustLimit - 1)

        const result = await tmpAccount.getMaxSpendable({ to, feeRate: 1 })

        expect(result).toEqual({ amount: 0n, fee: 0n, changeValue: 0n })
      })
    })

    test('should assume the sweep goes to the account\'s own address if to is omitted', async () => {
      const fee = sweepFee({ from: ADDRESSES[type], to: ADDRESSES[type], network })
      const tmpAccount = await fundNewAccount(Number(fee) + DUST_LIMITS[type])

      const result = await tmpAccount.getMaxSpendable({ feeRate: 1 })

      expect(result).toEqual({ amount: BigInt(DUST_LIMITS[type]), fee, changeValue: 0n })
    })

    // Waits until electrs has indexed an unconfirmed transaction from the mempool, since getBalance counts unconfirmed funds. Doesn't mine.
    const waitForMempoolIndexing = async (tmpAccount, sats) => {
      const start = Date.now()

      while (Date.now() - start < 15_000) {
        if (await tmpAccount.getBalance() === BigInt(sats)) return

        await new Promise(resolve => setTimeout(resolve, 250))
      }

      throw new Error('Timed out waiting for the balance.')
    }

    test('should return zero if the account has no UTXOs', async () => {
      const address = bitcoin.call(`getnewaddress "" ${ADDRESS_TYPES[type]}`, { rawResult: true })
      const tmpAccount = createTmpAccount(address)

      const result = await tmpAccount.getMaxSpendable({ feeRate: 1 })

      expect(result).toEqual({ amount: 0n, fee: 0n, changeValue: 0n })
    })

    test('should sweep every UTXO of the account', async () => {
      const values = [300_000, 200_000, 150_000]
      const address = bitcoin.call(`getnewaddress "" ${ADDRESS_TYPES[type]}`, { rawResult: true })
      const tmpAccount = createTmpAccount(address)

      for (const sats of values) {
        bitcoin.sendToAddress(address, (sats / 1e8).toFixed(8))
        await waiter.mine()

        lockUtxosOf(address)
      }

      const fee = sweepFee({ from: address, to: address, network, inputCount: values.length })

      const result = await tmpAccount.getMaxSpendable({ feeRate: 1 })

      expect(result).toEqual({ amount: 650_000n - fee, fee, changeValue: 0n })
    })

    test('should use the client\'s estimated fee rate if feeRate is omitted', async () => {
      const feeRate = 2.5
      const requestedTargets = []
      const tmpAccount = await fundNewAccount(300_000)
      const address = await tmpAccount.getAddress()
      tmpAccount._client.estimateFee = async (target) => {
        requestedTargets.push(target)
        return feeRate
      }
      const expectedFee = sweepFee({ from: address, to: address, network, feeRate })

      const result = await tmpAccount.getMaxSpendable()

      expect(requestedTargets).toEqual([1])
      expect(result).toEqual({ amount: 300_000n - expectedFee, fee: expectedFee, changeValue: 0n })
    })

    test('should not round a fractional fee rate', async () => {
      const feeRate = 0.5
      const expectedFee = sweepFee({ from: ADDRESSES[type], to: ADDRESSES[type], network, feeRate })

      const result = await account.getMaxSpendable({ feeRate })

      expect(expectedFee).toBeLessThan(sweepFee({ from: ADDRESSES[type], to: ADDRESSES[type], network }))
      expect(result).toEqual({
        amount: STARTING_BALANCE - expectedFee,
        fee: expectedFee,
        changeValue: 0n
      })
    })

    test('should exclude unconfirmed UTXOs from the sweep', async () => {
      const tmpAccount = await fundNewAccount(300_000)
      const address = await tmpAccount.getAddress()

      lockUtxosOf(address)
      bitcoin.sendToAddress(address, '0.00200000')
      await waitForMempoolIndexing(tmpAccount, 500_000)

      const fee = sweepFee({ from: address, to: address, network })

      const result = await tmpAccount.getMaxSpendable({ feeRate: 1 })

      expect(result).toEqual({ amount: 300_000n - fee, fee, changeValue: 0n })
    })

    test('should return zero if all the UTXOs are unconfirmed', async () => {
      const address = bitcoin.call(`getnewaddress "" ${ADDRESS_TYPES[type]}`, { rawResult: true })
      const tmpAccount = createTmpAccount(address)

      bitcoin.sendToAddress(address, '0.00300000')
      await waitForMempoolIndexing(tmpAccount, 300_000)

      const result = await tmpAccount.getMaxSpendable({ feeRate: 1 })

      expect(result).toEqual({ amount: 0n, fee: 0n, changeValue: 0n })
    })

    test('should throw if the sweep exceeds the maximum standard size', async () => {
      const tmpAccount = createTmpAccount(ADDRESSES[type])
      await tmpAccount._ensureConnected()
      tmpAccount._client.listSpendable = async () => Array.from({ length: 1_500 }, (_, index) => ({
        outpoint: { txid: index.toString(16).padStart(64, '0'), vout: 0 },
        value: 10_000n,
        height: 100
      }))

      const promise = tmpAccount.getMaxSpendable({ feeRate: 1 })

      await expect(promise).rejects.toThrow(ValueError)
      await expect(promise).rejects.toThrow('The transaction exceeds the maximum standard size.')
    })

    test('should throw if the recipient address is invalid', async () => {
      await expect(account.getMaxSpendable({ to: 'not-an-address', feeRate: 1 })).rejects.toThrow()
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

describe('WalletAccountReadOnlyBtc provider transaction id verification', () => {
  const REQUESTED_TXID = 'a'.repeat(64)

  const rogueTx = new Transaction()
  rogueTx.addInput(Buffer.alloc(32), 0)
  rogueTx.addOutput(Buffer.from([0x6a]), 0n)

  test('should throw from getTransaction if the provider returns a transaction that doesn\'t match the hash', async () => {
    const account = new WalletAccountReadOnlyBtc(ADDRESSES.segwit, {
      network: 'regtest',
      client: {
        connect: async () => {},
        getHistory: async () => [{ tx_hash: REQUESTED_TXID, height: 1 }],
        getTransaction: async () => rogueTx.toHex()
      }
    })

    const promise = account.getTransaction(REQUESTED_TXID)

    await expect(promise).rejects.toThrow(AssertionError)
    await expect(promise).rejects.toThrow('Transaction id mismatch')
  })
})
