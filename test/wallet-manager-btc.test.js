import { describe, test, expect, beforeEach } from '@jest/globals'
import { mnemonicToSeedSync } from 'bip39'

import WalletManagerBtc from '../src/wallet-manager-btc.js'
import WalletAccountBtc from '../src/wallet-account-btc.js'

const SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'
const INVALID_SEED_PHRASE = 'this is not valid mnemonic'
const SEED = mnemonicToSeedSync(SEED_PHRASE)

describe('WalletManagerBtc', () => {
  let wallet

  beforeEach(() => {
    wallet = new WalletManagerBtc(SEED_PHRASE)
  })

  describe('constructor', () => {
    test('should successfully initialize a wallet manager for the given seed buffer', () => {
      const wallet = new WalletManagerBtc(SEED)
      expect(wallet._seed).toEqual(SEED)
    })

    test('should throw if the seed phrase is invalid', () => {
      expect(() => { new WalletManagerBtc(INVALID_SEED_PHRASE) })
        .toThrow('Invalid seed phrase.')
    })
  })

  describe('getAccount', () => {
    test('should return the account at index 0 by default', async () => {
      const account = await wallet.getAccount()
      expect(account).toBeInstanceOf(WalletAccountBtc)
      expect(account.index).toBe(0)
    })

    test('should return the account at the given index', async () => {
      const account = await wallet.getAccount(3)
      expect(account).toBeInstanceOf(WalletAccountBtc)
      expect(account.index).toBe(3)
    })

    test('should throw if the index is a negative number', async () => {
      await expect(wallet.getAccount(-1)).rejects.toThrow(/Expected BIP32Path/)
    })
  })

  describe('getAccountByPath', () => {
    test('should return the account with the given path', async () => {
      const account = await wallet.getAccountByPath("1'/2/3")
      expect(account).toBeInstanceOf(WalletAccountBtc)
      expect(account.path).toBe("m/84'/0'/1'/2/3")
    })

    test('should throw if the path is invalid', async () => {
      await expect(wallet.getAccountByPath("a'/b/c")).rejects.toThrow(/Expected BIP32Path/)
    })
  })

  describe('getFeeRates', () => {
    test('should return the correct fee rates', async () => {
      global.fetch = () =>
        Promise.resolve({
          json: () => Promise.resolve({ fastestFee: 100, hourFee: 50 })
        })

      const feeRates = await wallet.getFeeRates()
      expect(feeRates.normal).toBe(50)
      expect(feeRates.fast).toBe(100)
    })

    test('should throw if the wallet cannot fetch fee rates', async () => {
      global.fetch = () => Promise.reject(new Error('network failure'))
      await expect(wallet.getFeeRates()).rejects.toThrow('network failure')
    })
  })
})
