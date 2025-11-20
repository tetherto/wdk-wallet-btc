import { beforeAll, describe, expect, test } from '@jest/globals'

import { HOST, PORT, ELECTRUM_PORT, ZMQ_PORT, DATA_DIR } from '../config.js'

import { BitcoinCli, Waiter } from '../helpers/index.js'

import WalletManagerBtc from '../../index.js'

const abs = x => x < 0n ? -x : x

function parseRawTransaction (rawTransaction, recipientAddress) {
  const getAddress = (vout) => vout.scriptPubKey.address || vout.scriptPubKey.addresses?.[0]
  
  const output = rawTransaction.vout.find(vout => getAddress(vout) === recipientAddress)
  
  return {
    txid: rawTransaction.txid,
    details: [{ address: getAddress(output), amount: output.value, vout: 0 }]
  }
}

const fees = {
  44: 226n,
  84: 141n
}

const SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'

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

describe.each([44, 84])('@wdk/wallet-btc (BIP %i)', (bip) => {
  const CONFIGURATION = {
    host: HOST,
    port: ELECTRUM_PORT,
    network: 'regtest',
    bip
  }

  let wallet, account0, account1

  beforeAll(async () => {
    wallet = new WalletManagerBtc(SEED_PHRASE, CONFIGURATION)
    account0 = await wallet.getAccount(2)
    account1 = await wallet.getAccount(3)

    bitcoin.sendToAddress(await account0.getAddress(), 0.01)
    bitcoin.sendToAddress(await account1.getAddress(), 0.01)

    await waiter.mine()
  })

  test('should derive an account, quote the cost of a tx and send the tx', async () => {
    const account0 = await wallet.getAccount(2)
    const account1 = await wallet.getAccount(3)

    const TRANSACTION = {
      to: await account1.getAddress(),
      value: 1_000n
    }

    const { fee: quoteFee } = await account0.quoteSendTransaction(TRANSACTION)

    const { hash, fee: sendFee } = await account0.sendTransaction(TRANSACTION)

    expect(sendFee).toBe(quoteFee)

    const transaction = parseRawTransaction(bitcoin.getRawTransaction(hash), TRANSACTION.to)
    expect(transaction.txid).toBe(hash)
    expect(transaction.details[0].address).toBe(TRANSACTION.to)

    const amount = Math.round(transaction.details[0].amount * 1e+8)
    expect(amount).toBe(Number(TRANSACTION.value))
    await waiter.mine()
  })

  test('should derive two accounts, send a tx from account 2 to 3 and get the correct balances', async () => {
    const account0 = await wallet.getAccount(2)
    const account1 = await wallet.getAccount(3)

    const initialBalance0 = await account0.getBalance()
    const initialBalance1 = await account1.getBalance()

    const TRANSACTION = {
      to: await account1.getAddress(),
      value: 5_000n
    }

    const { hash } = await account0.sendTransaction(TRANSACTION)

    await waiter.mine()

    const finalBalance0 = await account0.getBalance()
    const finalBalance1 = await account1.getBalance()

    const transaction = parseRawTransaction(bitcoin.getRawTransaction(hash), TRANSACTION.to)
    expect(transaction.txid).toBe(hash)
    expect(transaction.details[0].address).toBe(TRANSACTION.to)

    const actualFee = fees[bip]

    expect(abs(initialBalance0 - finalBalance0 - TRANSACTION.value - actualFee)).toBeLessThanOrEqual(1n)

    expect(finalBalance1).toBe(initialBalance1 + TRANSACTION.value)
  })

  test('should derive an account, sign a message and verify its signature', async () => {
    const account0 = await wallet.getAccount(2)

    const message = 'Hello, world!'

    const signature = await account0.sign(message)
    const verified = await account0.verify(message, signature)
    expect(verified).toBe(true)
  })

  test('should get a max spendable amount that is actually spendable', async () => {
    const account0 = await wallet.getAccount(2)
    const account1 = await wallet.getAccount(3)

    const balance = await account0.getBalance()
    const { amount } = await account0.getMaxSpendable()

    expect(amount).toBeGreaterThan(0n)
    expect(amount).toBeLessThan(balance)

    const TRANSACTION = {
      to: await account1.getAddress(),
      value: amount
    }

    const { hash } = await account0.sendTransaction(TRANSACTION)

    await waiter.mine()

    const transaction = parseRawTransaction(bitcoin.getRawTransaction(hash), TRANSACTION.to)
    expect(transaction.txid).toBe(hash)
    expect(transaction.details[0].address).toBe(TRANSACTION.to)
  })

  test('should dispose the wallet and erase the private keys of the accounts', async () => {
    const account0 = await wallet.getAccount(2)
    const account1 = await wallet.getAccount(3)

    wallet.dispose()

    const MESSAGE = 'Hello, world!'

    for (const account of [account0, account1]) {
      expect(() => account.keyPair.privateKey).toThrow()

      await expect(account.sign(MESSAGE)).rejects.toThrow("Cannot read properties of undefined (reading 'privateKey')")
    }
  })
})
