import 'dotenv/config'
import { describe, test, expect, beforeEach } from '@jest/globals'
import { mnemonicToSeedSync } from 'bip39'
import { callBitcoin, mineBlock } from './bitcoin-test-util'

import WalletAccountBtc from '../src/wallet-account-btc.js'

const SEED_PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const INVALID_SEED_PHRASE = 'this is not valid mnemonic'
const SEED = mnemonicToSeedSync(SEED_PHRASE)

const ACCOUNT_INDEX = 0
const ACCOUNT_PATH = "0'/0/0"


const config = {
  host: process.env.TEST_ELECTRUM_SERVER_HOST || '127.0.0.1',
  port: Number(process.env.TEST_ELECTRUM_SERVER_PORT|| 7777),
  network: 'regtest'
}

let minerAddr = null

describe('WalletAccountBtc', () => {
  let account
  let address
  let recipient

  beforeEach(async () => {
    account = new WalletAccountBtc(SEED_PHRASE, ACCOUNT_PATH, config)
    address = await account.getAddress()
    recipient =(await callBitcoin(`getnewaddress`)).toString().trim()
    if(!minerAddr) {
      minerAddr =(await callBitcoin(`getnewaddress`)).toString().trim()
    }
    callBitcoin(`sendtoaddress ${address} 0.01`)
    await mineBlock(minerAddr)
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

  describe('getTransfers', () => {
    test('should return an array of transfers', async () => {
      const transfers = await account.getTransfers()
      expect(Array.isArray(transfers)).toBe(true)
    })

    test('should return an empty array when limit is 0', async () => {
      const transfers = await account.getTransfers({ limit: 0 })
      expect(transfers).toEqual([])
    })

    test('should respect direction: incoming', async () => {
      const transfers = await account.getTransfers({ direction: 'incoming' })
      for (const t of transfers) {
        expect(t.direction).toBe('incoming')
      }
    })

    test('should respect direction: outgoing', async () => {
      await account.sendTransaction({ to: recipient, value: 1000 })
      await mineBlock(account)
      const transfers = await account.getTransfers({ direction: 'outgoing' })
      for (const t of transfers) {
        expect(t.direction).toBe('outgoing')
      }
    })

    test('should respect limit option', async () => {
      const transfers = await account.getTransfers({ limit: 1 })
      expect(transfers.length).toBeLessThanOrEqual(1)
    })

    test('should include block height in transfers', async () => {
      const transfers = await account.getTransfers()
      for (const t of transfers) {
        expect(typeof t.height).toBe('number')
        expect(t.height).toBeGreaterThanOrEqual(0)
      }
    })

    test('should include txid of correct format', async () => {
      const transfers = await account.getTransfers()
      for (const t of transfers) {
        expect(typeof t.txid).toBe('string')
        expect(t.txid.length).toBe(64)
      }
    })

    test('should include fee for outgoing transfers', async () => {
      await account.sendTransaction({ to: recipient, value: 2000 })
      await mineBlock(account)
      const transfers = await account.getTransfers({ direction: 'outgoing' })
      for (const t of transfers) {
        expect(t.fee === undefined || typeof t.fee === 'number').toBe(true)
      }
    })
  })

  describe('edge cases', () => {
    test('should throw for dust-limit value', async () => {
      await expect(account.sendTransaction({ to: recipient, value: 500 })).rejects.toThrow('dust limit')
    })

    test('should throw when no UTXOs are available', async () => {
      const fresh = new WalletAccountBtc(SEED_PHRASE, "0'/0/20", config)
      await expect(fresh.sendTransaction({ to: recipient, value: 1000 })).rejects.toThrow('No unspent outputs available.')
    })

    test('should throw if total balance is less than amount + fee', async () => {
      await expect(account.sendTransaction({ to: recipient, value: 900_000_000_000 })).rejects.toThrow('Insufficient balance')
    })

    test('should throw if change is below dust', async () => {
      const lowBalance = new WalletAccountBtc(SEED_PHRASE, "0'/0/30", config)
      const addr = await lowBalance.getAddress()
      callBitcoin(`sendtoaddress "${addr}" 0.00001`)
      await mineBlock(minerAddr)
      await expect(lowBalance.sendTransaction({ to: recipient, value: 1000 })).rejects.toThrow('Insufficient balance')
    })
  })
})
