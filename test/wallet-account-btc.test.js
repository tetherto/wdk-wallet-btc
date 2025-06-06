// Updated wallet-account-btc.test.js to match wallet-account-evm.test.js structure

import 'dotenv/config'
import { describe, test, expect, beforeEach } from '@jest/globals'
import { mnemonicToSeedSync } from 'bip39'
import { execSync } from 'child_process'

import WalletAccountBtc from '../src/wallet-account-btc.js'

const SEED_PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const INVALID_SEED_PHRASE = 'this is not valid mnemonic'
const SEED = mnemonicToSeedSync(SEED_PHRASE)

const ACCOUNT_INDEX = 0
const ACCOUNT_PATH = "0'/0/0"

const DATA_DIR = process.env.DATA_DIR || `${process.env.HOME}/.bitcoin`
const BCLI = `bitcoin-cli -regtest -datadir=${DATA_DIR} -rpcwallet=testwallet`
const callBitcoin = cmd => execSync(`${BCLI} ${cmd}`)

const config = {
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 7777),
  network: 'regtest'
}

let minerAddr = null
const mineBlock = async (account) => {
  if (!minerAddr) {
    minerAddr = callBitcoin(`getnewaddress`).toString().trim()
  }

  callBitcoin(`generatetoaddress 1 ${minerAddr}`)
  await new Promise(resolve => setTimeout(resolve, 5000))

  if (account) {
    await account.getBalance()
  }
}

describe('WalletAccountBtc', () => {
  let account
  let address
  let recipient

  beforeEach(async () => {
    account = new WalletAccountBtc(SEED_PHRASE, ACCOUNT_PATH, config)
    address = await account.getAddress()
    recipient = callBitcoin(`getnewaddress`).toString().trim()
    callBitcoin(`sendtoaddress ${address} 0.01`)
    await mineBlock(account)
  })

  describe('constructor', () => {
    test('should successfully initialize an account for the given seed phrase and path', () => {
      const acc = new WalletAccountBtc(SEED_PHRASE, ACCOUNT_PATH, config)
      expect(acc.index).toBe(ACCOUNT_INDEX)
      expect(acc.path).toBe("m/84'/0'/0'/0/0")
      expect(typeof acc.keyPair.privateKey).toBe('string')
      expect(typeof acc.keyPair.publicKey).toBe('string')
    })

    test('should successfully initialize an account for the given seed and path', () => {
      const acc = new WalletAccountBtc(SEED, ACCOUNT_PATH, config)
      expect(acc.index).toBe(ACCOUNT_INDEX)
      expect(acc.path).toBe("m/84'/0'/0'/0/0")
    })

    test('should throw if the seed phrase is invalid', () => {
      expect(() => new WalletAccountBtc(INVALID_SEED_PHRASE, ACCOUNT_PATH, config)).toThrow('The seed phrase is invalid.')
    })

    test('should throw if the path is invalid', () => {
      expect(() => new WalletAccountBtc(SEED_PHRASE, "a'/b/c", config)).toThrow(/Expected BIP32Path/)
    })
  })

  describe('getAddress', () => {
    test('should return a valid address string', async () => {
      const result = await account.getAddress()
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('sign', () => {
    test('should return a base64-encoded signature', async () => {
      const signature = await account.sign('hello world')
      expect(typeof signature).toBe('string')
      expect(() => Buffer.from(signature, 'base64')).not.toThrow()
    })
  })

  describe('verify', () => {
    const message = 'hello world'

    test('should return true for a valid signature', async () => {
      const signature = await account.sign(message)
      const isValid = await account.verify(message, signature)
      expect(isValid).toBe(true)
    })

    test('should return false for a tampered message', async () => {
      const signature = await account.sign(message)
      const isValid = await account.verify('tampered message', signature)
      expect(isValid).toBe(false)
    })

    test('should return false for a malformed signature', async () => {
      const isValid = await account.verify(message, 'not base64')
      expect(isValid).toBe(false)
    })
  })

  describe('sendTransaction', () => {
    test('should return a transaction id', async () => {
      const txid = await account.sendTransaction({ to: recipient, value: 1000 })
      expect(typeof txid).toBe('string')
      expect(txid.length).toBe(64)
    })
  })

  describe('quoteTransaction', () => {
    test('should return the expected fee', async () => {
      const fee = await account.quoteTransaction({ to: recipient, value: 1000 })
      expect(typeof fee).toBe('number')
      expect(fee).toBeGreaterThan(0)
    })
  })

  describe('getBalance', () => {
    test('should return a number', async () => {
      const balance = await account.getBalance()
      expect(typeof balance).toBe('number')
    })
  })

  describe('getTokenBalance', () => {
    test('should throw unsupported error', async () => {
      await expect(account.getTokenBalance('dummy')).rejects.toThrow('Method not supported on the bitcoin blockchain.')
    })
  })
})
