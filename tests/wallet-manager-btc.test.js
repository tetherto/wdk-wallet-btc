import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals'

import WalletManagerBtc, { WalletAccountBtc } from '../index.js'

const SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'

describe('WalletManagerBtc', () => {
  let wallet

  beforeEach(() => {
    wallet = new WalletManagerBtc(SEED_PHRASE)
  })

  afterEach(() => {
    wallet.dispose()
  })

  describe('getAccount', () => {
    test('should return the account at index 0 by default', async () => {
      const account = await wallet.getAccount()

      expect(account).toBeInstanceOf(WalletAccountBtc)

      expect(account.path).toBe("m/84'/1'/0'/0/0")
    })

    test('should return the account at the given index', async () => {
      const account = await wallet.getAccount(3)

      expect(account).toBeInstanceOf(WalletAccountBtc)

      expect(account.path).toBe("m/84'/1'/0'/0/3")
    })

    test('should throw if the index is a negative number', async () => {
      await expect(wallet.getAccount(-1)).rejects.toThrow(/Expected BIP32Path/)
    })
  })

  describe('getAccountByPath', () => {
    test('should return the account with the given path', async () => {
      const account = await wallet.getAccountByPath("1'/2/3")

      expect(account).toBeInstanceOf(WalletAccountBtc)

      expect(account.path).toBe("m/84'/1'/1'/2/3")
    })

    test('should throw if the path is invalid', async () => {
      await expect(wallet.getAccountByPath("a'/b/c"))
        .rejects.toThrow(/Expected BIP32Path/)
    })
  })

  describe('getFeeRates', () => {
    test('should return the correct fee rates', async () => {
      const DUMMY_FEE_RATES = {
        hourFee: 3_300_000_000,
        fastestFee: 6_000_000_000
      }

      global.fetch = jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue(DUMMY_FEE_RATES)
      })

      const feeRates = await wallet.getFeeRates()

      expect(global.fetch).toHaveBeenCalledWith('https://mempool.space/api/v1/fees/recommended')

      expect(feeRates).toEqual({
        normal: BigInt(DUMMY_FEE_RATES.hourFee),
        fast: BigInt(DUMMY_FEE_RATES.fastestFee)
      })
    })
  })
})
