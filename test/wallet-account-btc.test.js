import { jest } from '@jest/globals'
import { mockUtxo, mockTransaction, setupElectrumMocks } from './test-utils.js'

import bip39Mock from './__mocks__/bip39.js'
import bip32Mock, { verify } from './__mocks__/bip32.js'
import bitcoinjsLibMock from './__mocks__/bitcoinjs-lib.js'

jest.unstable_mockModule('bip39', async () => bip39Mock)
jest.unstable_mockModule('bip32', async () => bip32Mock)
jest.unstable_mockModule('bitcoinjs-lib', async () => bitcoinjsLibMock)
jest.unstable_mockModule('../src/electrum-client.js', async () => {
  const mockElectrumClient = (await import('./__mocks__/electrum-client.js')).default
  return { default: mockElectrumClient }
})

import { __mockBehaviors } from './__mocks__/electrum-client.js'

describe('WalletAccountBtc', () => {
  const seed = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
  const path = "0'/0/0"
  const recipient = 'mocked-btc-recipient'
  let WalletAccountBtc
  let account

  beforeAll(async () => {
    WalletAccountBtc = (await import('../src/wallet-account-btc.js')).default
  })

  beforeEach(() => {
    setupElectrumMocks(__mockBehaviors)
    verify.mockReset()
    verify.mockReturnValue(true)
    account = new WalletAccountBtc(seed, path, { network: 'regtest' })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  test('returns the correct address using mocked bitcoinjs-lib', async () => {
    const address = await account.getAddress()

    expect(address).toBe('mocked-btc-address')
  })

  test('generates a valid base64-encoded signature from sign()', async () => {
    const signature = await account.sign('hello world')

    expect(typeof signature).toBe('string')
    expect(() => Buffer.from(signature, 'base64')).not.toThrow()
  })

  test('verifies a message signed with the same key', async () => {
    const signature = await account.sign('hello world')

    const isValid = await account.verify('hello world', signature)

    expect(isValid).toBe(true)
  })

  test('returns confirmed balance from mocked electrum client', async () => {
    const balance = await account.getBalance()

    expect(balance).toBe(100_000)
  })

  test('returns NaN when balance response is undefined', async () => {
    __mockBehaviors.getBalance.mockResolvedValueOnce({})

    const balance = await account.getBalance()

    expect(balance).toBeNaN()
  })

  test('throws error when electrum client fails to get balance', async () => {
    __mockBehaviors.getBalance.mockRejectedValueOnce(new Error('Disconnected'))

    await expect(account.getBalance()).rejects.toThrow('Disconnected')
  })

  test('throws when calling getTokenBalance on bitcoin account', async () => {
    await expect(account.getTokenBalance('token-address')).rejects.toThrow()
  })

  test('fails verification if message content is altered', async () => {
    verify.mockReturnValueOnce(false)
    const signature = await account.sign('hello world')

    const isValid = await account.verify('tampered', signature)

    expect(isValid).toBe(false)
  })

  test('returns txid when sendTransaction succeeds', async () => {
    __mockBehaviors.getUnspent.mockResolvedValueOnce(mockUtxo())
    __mockBehaviors.getTransaction.mockResolvedValueOnce(mockTransaction())
    __mockBehaviors.getFeeEstimate.mockResolvedValueOnce(0.00001)

    const txid = await account.sendTransaction({
      to: recipient,
      value: 1000
    })

    expect(txid).toBe('mocked-txid')
  })

  test('throws when no UTXOs are available', async () => {
    await expect(account.sendTransaction({
      to: recipient,
      value: 1000
    })).rejects.toThrow('No unspent outputs available.')
  })

  test('index getter parses derivation path correctly', () => {
    const index = account.index

    expect(index).toBe(0)
  })

  test('returns numeric fee from quoteTransaction', async () => {
    __mockBehaviors.getUnspent.mockResolvedValueOnce(mockUtxo())
    __mockBehaviors.getTransaction.mockResolvedValueOnce(mockTransaction())
    __mockBehaviors.getFeeEstimate.mockResolvedValueOnce(0.00001)

    const fee = await account.quoteTransaction({
      to: recipient,
      value: 1000
    })

    expect(typeof fee).toBe('number')
    expect(fee).toBeGreaterThan(0)
  })

  test('returns empty array when no transfer history exists', async () => {
    __mockBehaviors.getHistory.mockResolvedValueOnce([])

    const transfers = await account.getTransfers()

    expect(Array.isArray(transfers)).toBe(true)
    expect(transfers.length).toBe(0)
  })

  test('throws if amount is at or below dust limit', async () => {
    __mockBehaviors.getUnspent.mockResolvedValueOnce([
      { tx_hash: 'a'.repeat(64), tx_pos: 0, value: 10_000 }
    ])
    __mockBehaviors.getTransaction.mockResolvedValueOnce({
      vout: [{ value: 10_000, scriptPubKey: { hex: '0014abcdef' } }]
    })

    await expect(account.sendTransaction({
      to: recipient,
      value: 546
    })).rejects.toThrow('The amount must be bigger than the dust limit')
  })

  test('throws if even combined UTXOs do not cover amount', async () => {
    __mockBehaviors.getUnspent.mockResolvedValueOnce([
      { tx_hash: 'a'.repeat(64), tx_pos: 0, value: 1000 }
    ])
    __mockBehaviors.getTransaction.mockResolvedValueOnce({
      vout: [{ value: 1000, scriptPubKey: { hex: '0014abcdef' } }]
    })

    await expect(account.sendTransaction({
      to: recipient,
      value: 5000
    })).rejects.toThrow('Insufficient balance to send the transaction.')
  })

  test('throws if fee leaves insufficient change', async () => {
    __mockBehaviors.getUnspent.mockResolvedValueOnce([
      { tx_hash: 'a'.repeat(64), tx_pos: 0, value: 5000 }
    ])
    __mockBehaviors.getTransaction.mockResolvedValueOnce({
      vout: [{ value: 5000, scriptPubKey: { hex: '0014abcdef' } }]
    })
    __mockBehaviors.getFeeEstimate.mockResolvedValueOnce(0.1)

    await expect(account.sendTransaction({
      to: recipient,
      value: 1000
    })).rejects.toThrow('Insufficient balance to send the transaction.')
  })

  test('handles change below dust limit without error', async () => {
    __mockBehaviors.getUnspent.mockResolvedValueOnce([
      { tx_hash: 'b'.repeat(64), tx_pos: 0, value: 1000 }
    ])
    __mockBehaviors.getTransaction.mockResolvedValueOnce({
      vout: [{ value: 1000, scriptPubKey: { hex: '0014abcdef' } }]
    })
    __mockBehaviors.getFeeEstimate.mockResolvedValueOnce(0)

    const txid = await account.sendTransaction({
      to: recipient,
      value: 600
    })

    expect(txid).toBe('mocked-txid')
  })

  test('filters transfer history by incoming only', async () => {
    __mockBehaviors.getHistory.mockResolvedValueOnce([
      { tx_hash: 'abc', height: 100 }
    ])
    __mockBehaviors.getTransaction.mockResolvedValueOnce({
      vin: [],
      vout: [{
        value: 1000,
        scriptPubKey: { address: 'mocked-btc-address' }
      }]
    })

    const transfers = await account.getTransfers({ direction: 'incoming' })

    expect(transfers).toHaveLength(1)
    expect(transfers[0].direction).toBe('incoming')
  })

  test('parses outgoing transfer using address arrays', async () => {
    __mockBehaviors.getHistory.mockResolvedValueOnce([
      { tx_hash: 'tx1', height: 50 }
    ])

    // first call: actual transaction
    __mockBehaviors.getTransaction.mockResolvedValueOnce({
      vin: [{ txid: 'prev1', vout: 0 }],
      vout: [
        { value: 1000, scriptPubKey: { addresses: ['recipient'] } },
        { value: 500, scriptPubKey: { addresses: ['mocked-btc-address'] } }
      ]
    })
    // second call: for getInputValue
    __mockBehaviors.getTransaction.mockResolvedValueOnce({
      vout: [{ value: 1500, scriptPubKey: { addresses: ['mocked-btc-address'] } }]
    })
    // third call: for isOutgoingTx
    __mockBehaviors.getTransaction.mockResolvedValueOnce({
      vout: [{ value: 1500, scriptPubKey: { addresses: ['mocked-btc-address'] } }]
    })

    const transfers = await account.getTransfers({ direction: 'outgoing' })

    expect(transfers).toHaveLength(1)
    expect(transfers[0]).toMatchObject({
      direction: 'outgoing',
      recipient: 'recipient',
      fee: 0
    })
  })

  test('ignores unrelated outputs when not outgoing', async () => {
    __mockBehaviors.getHistory.mockResolvedValueOnce([
      { tx_hash: 'tx2', height: 10 }
    ])

    __mockBehaviors.getTransaction.mockResolvedValueOnce({
      vin: [{ txid: 'other', vout: 0 }],
      vout: [
        { value: 100, scriptPubKey: {} }
      ]
    })
    // for getInputValue
    __mockBehaviors.getTransaction.mockResolvedValueOnce({
      vout: [{ value: 100, scriptPubKey: { addresses: ['someone-else'] } }]
    })
    // for isOutgoingTx
    __mockBehaviors.getTransaction.mockResolvedValueOnce({
      vout: [{ value: 100, scriptPubKey: { addresses: ['someone-else'] } }]
    })

    const transfers = await account.getTransfers({ direction: 'outgoing' })

    expect(transfers).toEqual([])
  })

  test('respects limit option', async () => {
    __mockBehaviors.getHistory.mockResolvedValueOnce([
      { tx_hash: 'tx3', height: 20 }
    ])
    __mockBehaviors.getTransaction.mockResolvedValueOnce({
      vin: [],
      vout: [
        { value: 1000, scriptPubKey: { address: 'mocked-btc-address' } },
        { value: 2000, scriptPubKey: { address: 'mocked-btc-address' } }
      ]
    })

    const transfers = await account.getTransfers({ direction: 'incoming', limit: 1 })

    expect(transfers).toHaveLength(1)
  })

  test('skips transfers not matching direction filter', async () => {
    __mockBehaviors.getHistory.mockResolvedValueOnce([
      { tx_hash: 'tx4', height: 30 }
    ])
    __mockBehaviors.getTransaction.mockResolvedValueOnce({
      vin: [{ txid: 'prev2', vout: 0 }],
      vout: [
        { value: 1000, scriptPubKey: { addresses: ['recipient'] } }
      ]
    })
    __mockBehaviors.getTransaction.mockResolvedValueOnce({
      vout: [{ value: 1000, scriptPubKey: { addresses: ['mocked-btc-address'] } }]
    })
    __mockBehaviors.getTransaction.mockResolvedValueOnce({
      vout: [{ value: 1000, scriptPubKey: { addresses: ['mocked-btc-address'] } }]
    })

    const transfers = await account.getTransfers({ direction: 'incoming' })

    expect(transfers).toEqual([])
  })

  test('returns empty result when limit is zero', async () => {
    __mockBehaviors.getHistory.mockResolvedValueOnce([
      { tx_hash: 'txA', height: 1 },
      { tx_hash: 'txB', height: 2 }
    ])

    const transfers = await account.getTransfers({ limit: 0 })

    expect(transfers).toEqual([])
    expect(__mockBehaviors.getTransaction).not.toHaveBeenCalled()
  })

  test('handles undefined scriptPubKey gracefully', async () => {
    __mockBehaviors.getHistory.mockResolvedValueOnce([
      { tx_hash: 'txC', height: 3 }
    ])
    __mockBehaviors.getTransaction.mockResolvedValueOnce({
      vin: [{ txid: 'prev3', vout: 0 }],
      vout: [
        { value: 100 }
      ]
    })
    __mockBehaviors.getTransaction.mockResolvedValueOnce({
      vout: [{ value: 100, scriptPubKey: { addresses: ['mocked-btc-address'] } }]
    })
    __mockBehaviors.getTransaction.mockResolvedValueOnce({
      vout: [{ value: 100, scriptPubKey: { addresses: ['mocked-btc-address'] } }]
    })

    const transfers = await account.getTransfers({ direction: 'outgoing' })

    expect(transfers).toHaveLength(1)
    expect(transfers[0].recipient).toBeNull()
  })
})

describe('WalletAccountBtc - invalid mnemonic', () => {
  test('throws error for invalid seed phrase', async () => {
    jest.resetModules()
    jest.unstable_mockModule('bip39', async () => ({
      validateMnemonic: () => false,
      mnemonicToSeedSync: () => Buffer.alloc(64)
    }))

    const WalletAccountBtc = (await import('../src/wallet-account-btc.js')).default

    expect(() => new WalletAccountBtc('invalid seed', "0'/0/0", { network: 'regtest' }))
      .toThrow('The seed phrase is invalid.')
  })
})
