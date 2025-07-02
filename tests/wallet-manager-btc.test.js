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
    test('should successfully initialize a wallet manager for the given seed phrase', () => {
      const wallet = new WalletManagerBtc(SEED_PHRASE)
      expect(wallet.seedPhrase).toBe(SEED_PHRASE)
    })

    test('should successfully initialize a wallet manager for the given seed buffer', () => {
      const wallet = new WalletManagerBtc(SEED)
      expect(wallet.seedPhrase).toEqual(SEED)
    })

    test('should throw if the seed phrase is invalid', () => {
      expect(() => { new WalletManagerBtc(INVALID_SEED_PHRASE) })
        .toThrow('The seed phrase is invalid.')
    })
  })

  describe('static getRandomSeedPhrase', () => {
    test('should generate a valid 12-word seed phrase', () => {
      const seedPhrase = WalletManagerBtc.getRandomSeedPhrase()
      const words = seedPhrase.trim().split(/\s+/)
      expect(words).toHaveLength(12)
      expect(words.every(word => bip39.wordlists.EN.includes(word))).toBe(true)
    })
  })

  describe('static isValidSeedPhrase', () => {
    test('should return true for a valid seed phrase', () => {
      expect(WalletManagerBtc.isValidSeedPhrase(SEED_PHRASE)).toBe(true)
    })

    test('should return false for an invalid seed phrase', () => {
      expect(WalletManagerBtc.isValidSeedPhrase(INVALID_SEED_PHRASE)).toBe(false)
    })

    test('should return false for an empty string', () => {
      expect(WalletManagerBtc.isValidSeedPhrase('')).toBe(false)
    })
  })

  describe('getAccount', () => {
    test('should return the account at index 0 by default', async () => {
      const account = await wallet.getAccount()
      expect(account).toBeInstanceOf(WalletAccountBtc)
      expect(account.path).toBe("m/84'/0'/0'/0/0")
    })

    test('should return the account at the given index', async () => {
      const account = await wallet.getAccount(3)
      expect(account).toBeInstanceOf(WalletAccountBtc)
      expect(account.path).toBe("m/84'/0'/0'/0/3")
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
      global.fetch = jest.fn(url =>
          url === 'https://mempool.space/api/v1/fees/recommended' &&
          Promise.resolve({
            json: () => Promise.resolve({ fastestFee: 100, hourFee: 50 })
          })
      )
      const feeRates = await wallet.getFeeRates()
      expect(feeRates.normal).toBe(50)
      expect(feeRates.fast).toBe(100)
    })
  })
})
