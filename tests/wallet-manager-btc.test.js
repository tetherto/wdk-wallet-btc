import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals'

import WalletManagerBtc, { WalletAccountBtc } from '../index.js'
import SeedSignerBtc from '../src/signers/index.js'
const SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'

describe('WalletManagerBtc', () => {
  let wallet

  beforeEach(() => {
    const signer = new SeedSignerBtc(SEED_PHRASE, "0'/0/0")
    wallet = new WalletManagerBtc(signer)
  })

  afterEach(() => {
    wallet.dispose()
  })

  describe('getAccount', () => {
    test('should return the account at index 0 by default', async () => {
      const account = await wallet.getAccount()

      expect(account).toBeInstanceOf(WalletAccountBtc)

      expect(account.path).toBe("m/44'/0'/0'/0/0")
    })

    test('should return the account at the given index', async () => {
      const account = await wallet.getAccount(3)

      expect(account).toBeInstanceOf(WalletAccountBtc)

      expect(account.path).toBe("m/44'/0'/0'/0/3")
    })

    test('should throw if the index is a negative number', async () => {
      await expect(wallet.getAccount(-1)).rejects.toThrow(/Expected BIP32Path/)
    })
  })

  describe('getAccountByPath', () => {
    test('should return the account with the given path', async () => {
      const account = await wallet.getAccountByPath("1'/2/3")

      expect(account).toBeInstanceOf(WalletAccountBtc)

      expect(account.path).toBe("m/44'/0'/1'/2/3")
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
  describe('signer management', () => {
    test('createSigner registers a signer retrievable via getSigner', () => {
      const base = wallet.getSigner('default')
      const altSigner = base.derive("0'/0/0")
      wallet.createSigner('alt', altSigner)

      const got = wallet.getSigner('alt')
      expect(got).toBe(altSigner)
    })

    test('getAccountByPath with signerName uses that signer and derives path', async () => {
      const base = wallet.getSigner('default')
      const altSigner = base.derive("0'/0/0")
      wallet.createSigner('alt', altSigner)

      const acc = await wallet.getAccountByPath("1'/2/3", 'alt')
      expect(acc).toBeInstanceOf(WalletAccountBtc)
      expect(acc.path).toBe("m/44'/0'/1'/2/3")
    })

    test('getAccountByPath caches per signerName:path (same instance on repeat)', async () => {
      const acc1 = await wallet.getAccountByPath("0'/0/7", 'default')
      const acc2 = await wallet.getAccountByPath("0'/0/7", 'default')
      expect(acc2).toBe(acc1)
    })

    test('getAccountByPath does not collide across signer names with same path', async () => {
      const base = wallet.getSigner('default')
      const altSigner = base.derive("0'/0/0")
      wallet.createSigner('alt', altSigner)

      const accDefault = await wallet.getAccountByPath("0'/0/5", 'default')
      const accAlt = await wallet.getAccountByPath("0'/0/5", 'alt')

      expect(accDefault).toBeInstanceOf(WalletAccountBtc)
      expect(accAlt).toBeInstanceOf(WalletAccountBtc)
      expect(accAlt).not.toBe(accDefault)

      expect(accDefault.path).toBe("m/44'/0'/0'/0/5")
      expect(accAlt.path).toBe("m/44'/0'/0'/0/5")
    })

    test('getAccountByPath throws for unknown signerName', async () => {
      await expect(wallet.getAccountByPath("0'/0/0", 'ghost'))
        .rejects.toThrow('Signer ghost not found.')
    })
  })
})
