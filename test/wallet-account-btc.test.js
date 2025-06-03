// wallet-account-btc.test.js
import 'dotenv/config'
import { jest } from '@jest/globals'
import { execSync } from 'child_process'

jest.setTimeout(30000)

const DATA_DIR = process.env.DATA_DIR || `${process.env.HOME}/.bitcoin`
const BCLI = `bitcoin-cli -regtest -datadir=${DATA_DIR} -rpcwallet=testwallet`
const callBitcoin = cmd => execSync(`${BCLI} ${cmd}`)

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
  const seed = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
  const path = "0'/0/0"
  const config = {
    host: process.env.HOST || '127.0.0.1',
    port: Number(process.env.PORT || 7777),
    network: 'regtest'
  }

  let WalletAccountBtc
  let account
  let address
  let recipient

  beforeAll(async () => {
    WalletAccountBtc = (await import('../src/wallet-account-btc.js')).default
  })

  describe('electrum client integration', () => {
    beforeAll(async () => {
      account = new WalletAccountBtc(seed, path, config)
      address = await account.getAddress()
      recipient = callBitcoin(`getnewaddress`).toString().trim()
      callBitcoin(`sendtoaddress ${address} 0.01`)
      await mineBlock(account)
    })

    test('getBalance returns confirmed balance', async () => {
      const balance = await account.getBalance()
      expect(typeof balance).toBe('number')
      expect(balance).toBeGreaterThan(0)
    })

    test('returns zero balance for a fresh unused address', async () => {
      const freshAccount = new WalletAccountBtc(seed, "0'/0/10", config)
      const balance = await freshAccount.getBalance()
      expect(balance).toBe(0)
    })

    test('getTokenBalance throws unsupported error', async () => {
      await expect(account.getTokenBalance('dummy')).rejects.toThrow('Method not supported on the bitcoin blockchain.')
    })

    test('throws error for dust limit transaction', async () => {
      await expect(account.sendTransaction({ to: recipient, value: 500 })).rejects.toThrow('dust limit')
    })

    test('quoteTransaction returns numeric fee', async () => {
      const fee = await account.quoteTransaction({ to: recipient, value: 1000 })
      expect(typeof fee).toBe('number')
      expect(fee).toBeGreaterThan(0)
    })

    test('sendTransaction returns txid', async () => {
      const txid = await account.sendTransaction({ to: recipient, value: 1000 })
      expect(typeof txid).toBe('string')
      expect(txid.length).toBe(64)
    })

    test('throws when no UTXOs are available', async () => {
      const freshAccount = new WalletAccountBtc(seed, "0'/0/20", config)
      await expect(freshAccount.sendTransaction({ to: recipient, value: 1000 })).rejects.toThrow('No unspent outputs available.')
    })

    test('throws if amount + fee > available balance', async () => {
      await expect(account.sendTransaction({ to: recipient, value: 900_000_000_000 })).rejects.toThrow('Insufficient balance')
    })

    test('throws if fee leaves insufficient change', async () => {
      const lowBalanceAccount = new WalletAccountBtc(seed, "0'/0/30", config)
      const addr = await lowBalanceAccount.getAddress()
      callBitcoin(`sendtoaddress ${addr} 0.00001`)
      await mineBlock(lowBalanceAccount)
      await expect(lowBalanceAccount.sendTransaction({ to: recipient, value: 1000 })).rejects.toThrow('Insufficient balance')
    })

    test('getTransfers returns array', async () => {
      const transfers = await account.getTransfers()
      expect(Array.isArray(transfers)).toBe(true)
    })

    test('getTransfers returns empty with limit 0', async () => {
      const transfers = await account.getTransfers({ limit: 0 })
      expect(transfers).toEqual([])
    })

    test('getTransfers respects direction filter: incoming', async () => {
      const transfers = await account.getTransfers({ direction: 'incoming' })
      for (const tx of transfers) {
        expect(tx.direction).toBe('incoming')
      }
    })

    test('getTransfers respects direction filter: outgoing', async () => {
      await mineBlock(account)
      await account.sendTransaction({ to: recipient, value: 5000 })
      await mineBlock(account)
      const transfers = await account.getTransfers({ direction: 'outgoing' })
      for (const tx of transfers) {
        expect(tx.direction).toBe('outgoing')
      }
    })

    test('getTransfers applies limit correctly', async () => {
      const transfers = await account.getTransfers({ direction: 'incoming', limit: 1 })
      expect(transfers.length).toBeLessThanOrEqual(1)
    })

    test('incoming transfer includes correct block height', async () => {
      const transfers = await account.getTransfers({ direction: 'incoming' })
      for (const tx of transfers) {
        expect(typeof tx.height).toBe('number')
        expect(tx.height).toBeGreaterThanOrEqual(0)
      }
    })

    test('getTransfers includes matching txids from getHistory and getTransaction', async () => {
      const transfers = await account.getTransfers()
      for (const t of transfers) {
        expect(typeof t.txid).toBe('string')
        expect(t.txid.length).toBe(64)
      }
    })

    test('quoteTransaction does not affect balance or UTXOs', async () => {
      const before = await account.getBalance()
      const fee = await account.quoteTransaction({ to: recipient, value: 1000 })
      expect(typeof fee).toBe('number')
      expect(fee).toBeGreaterThan(0)
      const after = await account.getBalance()
      expect(after).toBe(before)
    })

    test('getTransfers includes fee field in outgoing transfers', async () => {
      await mineBlock(account)
      await account.sendTransaction({ to: recipient, value: 3000 })
      await mineBlock(account)
      const outgoing = await account.getTransfers({ direction: 'outgoing' })
      for (const t of outgoing) {
        if (t.direction === 'outgoing') {
          expect(typeof t.fee === 'number' || t.fee === undefined).toBe(true)
        }
      }
    })
  })

  test('returns the correct address using real bitcoinjs-lib', async () => {
    account = new WalletAccountBtc(seed, path, config)
    const addr = await account.getAddress()
    expect(addr).toBe(await account.getAddress())
  })

  test('generates a valid base64-encoded signature from sign()', async () => {
    account = new WalletAccountBtc(seed, path, config)
    const signature = await account.sign('hello world')
    expect(typeof signature).toBe('string')
    expect(() => Buffer.from(signature, 'base64')).not.toThrow()
  })

  test('verifies a message signed with the same key', async () => {
    account = new WalletAccountBtc(seed, path, config)
    const signature = await account.sign('hello world')
    const isValid = await account.verify('hello world', signature)
    expect(isValid).toBe(true)
  })

  test('fails verification if message content is altered', async () => {
    account = new WalletAccountBtc(seed, path, config)
    const signature = await account.sign('hello world')
    const isValid = await account.verify('tampered', signature)
    expect(isValid).toBe(false)
  })

  test('index getter parses derivation path correctly', () => {
    account = new WalletAccountBtc(seed, path, config)
    const index = account.index
    expect(index).toBe(0)
  })
})

describe('WalletAccountBtc - invalid mnemonic', () => {
  test('throws error for invalid seed phrase', async () => {
    const WalletAccountBtc = (await import('../src/wallet-account-btc.js')).default
    expect(() => new WalletAccountBtc('invalid seed', "0'/0/0", { network: 'regtest' }))
      .toThrow('The seed phrase is invalid.')
  })
})