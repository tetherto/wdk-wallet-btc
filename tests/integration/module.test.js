import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import { mnemonicToSeedSync } from 'bip39'

import { HOST, PORT, ELECTRUM_PORT, ZMQ_PORT, DATA_DIR } from '../config.js'

import { BitcoinCli, Waiter } from '../helpers/index.js'

import WalletManagerBtc, { WalletAccountBtc } from '../../index.js'

const TIMEOUT = 30000 // 30 seconds

const SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'

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

describe('@wdk/wallet-btc', () => {
    let wallet, account0, account1

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
    //   account = new WalletAccountBtc(SEED_PHRASE, "0'/0/0", CONFIGURATION)
      wallet = new WalletManagerBtc(SEED_PHRASE, CONFIGURATION)
      account0 = await wallet.getAccount(0)
      account1 = await wallet.getAccount(1)

  
      bitcoin.sendToAddress(await account0.getAddress(), 0.01)
      bitcoin.sendToAddress(await account1.getAddress(), 0.01)
  
      await waiter.mine()
    })

    test('should derive an account, quote the cost of a tx and send the tx', async () => {
        const account0 = await wallet.getAccount(0)
        const account1 = await wallet.getAccount(1)

        const TRANSACTION = {
            to: await account1.getAddress(),
            value: 1_000
          }

        const { fee: quoteFee } = await account0.quoteSendTransaction(TRANSACTION)

        const { hash, fee: sendFee } = await account0.sendTransaction(TRANSACTION)
        
        // const { fees } = bitcoin.getMempoolEntry(hash)
        // const baseFee = Math.round(fees.base * 1e+8)
        expect(sendFee).toBe(quoteFee)
  
        const transaction = bitcoin.getTransaction(hash)
        expect(transaction.txid).toBe(hash)
        expect(transaction.details[0].address).toBe(TRANSACTION.to)
  
        const amount = Math.round(transaction.details[0].amount * 1e+8)
        expect(amount).toBe(TRANSACTION.value)
    }, TIMEOUT)

    test('should derive two accounts, send a tx from account 0 to 1 and get the correct balances', async () => {
      const account0 = await wallet.getAccount(0)
      const account1 = await wallet.getAccount(1)

      const initialBalance0 = await account0.getBalance()
      const initialBalance1 = await account1.getBalance()

      const TRANSACTION = {
        to: await account1.getAddress(),
        value: 5_000
      }

      const { hash, fee } = await account0.sendTransaction(TRANSACTION)
      
      await waiter.mine()

      const finalBalance0 = await account0.getBalance()
      const finalBalance1 = await account1.getBalance()

      const transaction = bitcoin.getTransaction(hash)
      expect(transaction.txid).toBe(hash)
      expect(transaction.details[0].address).toBe(TRANSACTION.to)

      const actualFee = initialBalance0 - finalBalance0 - TRANSACTION.value

      expect(finalBalance0).toBe(initialBalance0 - TRANSACTION.value - actualFee)
      
      // Account 1 receives the mining reward as well
      expect(finalBalance1).toBe(initialBalance1 + TRANSACTION.value + 1_000)
    }, TIMEOUT)

    test('should derive an account, sign a message and verify its signature', async () => {
      const account0 = await wallet.getAccount(0)

      const message = 'Hello, world!'

      const signature = await account0.sign(message)
      const verified = await account0.verify(message, signature)
      expect(verified).toBe(true)
    }, TIMEOUT)

    test('should dispose the wallet and erase the private keys of the accounts', async () => {
      const account0 = await wallet.getAccount(0),
          account1 = await wallet.getAccount(1)
    
      wallet.dispose()

      const MESSAGE = 'Hello, world!'

      for (const account of [account0, account1]) {
        expect(() => account.keyPair.privateKey).toThrow()

        await expect(account.sign(MESSAGE)).rejects.toThrow("Cannot read properties of undefined (reading 'sign')")
      }
    }, TIMEOUT)

})