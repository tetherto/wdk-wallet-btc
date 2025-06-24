import 'dotenv/config'
import { describe, test, expect, beforeEach } from '@jest/globals'
import { callBitcoin, mineBlock, getTransaction } from './bitcoin-test-util'

import WalletAccountBtc from '../src/wallet-account-btc.js'
import WalletManagerBtc from '../src/wallet-manager-btc.js'

// Values not verified against third party source
const SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'
const PUBLIC_KEY = '038b3e304b15f9fd0439ffc37cdae3c9feb1b892f7f45ed859c49a5940d9d327dd'
const PRIVATE_KEY = '118,241,93,91,104,120,112,186,130,53,116,23,189,1,179,174,76,80,182,187,237,242,142,71,234,179,155,97,211,146,62,115'
const ADDRESS = 'bcrt1q83020gdrr9de3r238vtawd92nyh2jtzx5khjwv'
const VALID_SIG = '1BSKnoYsXjzt1bi4w7PhbJXhZYZgsBUwRzBCFtO9TXMGT+PLDVlcKB5myagYzERiuppOcktfuyVhwkkoyxI3HQ=='

const ACCOUNT_INDEX = 0
const ACCOUNT_PATH = "0'/0/0"

function isUint8 (v) {
  return v instanceof Uint8Array
}

const config = {
  host: process.env.TEST_ELECTRUM_SERVER_HOST || '127.0.0.1',
  port: Number(process.env.TEST_ELECTRUM_SERVER_PORT || 7777),
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
    recipient = (await callBitcoin('getnewaddress')).toString().trim()
    if (!minerAddr) {
      minerAddr = (await callBitcoin('getnewaddress')).toString().trim()
    }
    callBitcoin(`sendtoaddress ${address} 0.01`)
    await mineBlock(minerAddr)
  })

  describe('constructor', () => {
    test('should successfully initialize an account for the given seed phrase and path', () => {
      const acc = new WalletAccountBtc(SEED_PHRASE, ACCOUNT_PATH, config)
      expect(acc.index).toBe(ACCOUNT_INDEX)
      expect(acc.path).toBe("m/84'/0'/0'/0/0")
      expect(acc._keyPair.privateKey.toString('hex')).toBe(PRIVATE_KEY)
      expect(acc._keyPair.publicKey.toString('hex')).toBe(PUBLIC_KEY)
      expect(isUint8(acc._keyPair.privateKey)).toBe(true)
      expect(isUint8(acc.keyPair.publicKey)).toBe(true)
    })
  })

  describe('getAddress', () => {
    test('should return a valid address string', async () => {
      const result = await account.getAddress()
      expect(result).toBe(ADDRESS)
    })
  })

  describe('sign', () => {
    test('should return a base64-encoded signature', async () => {
      const signature = await account.sign('hello world')
      expect(signature).toBe(VALID_SIG)
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
  })

  describe('sendTransaction', () => {
    test('should return a transaction id', async () => {
      const val = 1000
      const txid = await account.sendTransaction({ to: recipient, value: val })
      expect(typeof txid).toBe('string')
      await mineBlock(minerAddr)
      const txData = await getTransaction(txid)
      expect(txData.confirmations).toBe(1)
      expect(txid).toBe(txData.txid)
      expect(txData.vout[0].scriptPubKey.address).toBe(recipient)
      expect(txData.vout[0].value).toBe(val)
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
      await mineBlock(minerAddr)
      const seedPhrase = WalletManagerBtc.getRandomSeedPhrase()
      const acct = new WalletAccountBtc(seedPhrase, ACCOUNT_PATH, config)
      const addr = await acct.getAddress()
      await callBitcoin(`sendtoaddress ${addr} 0.01`)
      await mineBlock(minerAddr)
      const balance = await acct.getBalance()
      expect(balance).toBe(1000000)
    })
  })

  describe('getTokenBalance', () => {
    test('should throw unsupported error', async () => {
      await expect(account.getTokenBalance('dummy')).rejects.toThrow('getTokenBalance is not supported on the Bitcoin blockchain.')
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
      await mineBlock(minerAddr)
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
      await callBitcoin(`sendtoaddress ${address} 0.05`)
      await mineBlock(minerAddr)
      const balance = await account.getBalance()
      await account.sendTransaction({ to: recipient, value: 2000 })
      await mineBlock(minerAddr)
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
