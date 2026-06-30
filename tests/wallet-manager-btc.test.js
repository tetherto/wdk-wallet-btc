import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals'

import WalletManagerBtc, { WalletAccountBtc } from '../index.js'
import SeedSignerBtc, { PrivateKeySignerBtc } from '../src/signers/index.js'
const SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'
const PRIVATE_KEY = '15e083525dac99a2a9bba8f14a6eed9704a77c5994b1a9b4d7271ebd353b7966'

describe('WalletManagerBtc', () => {
  let wallet

  beforeEach(() => {
    const signer = new SeedSignerBtc(SEED_PHRASE)
    wallet = new WalletManagerBtc(signer)
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
  describe('signer management', () => {
    test('getSigner() returns the default signer registered at construction', () => {
      const def = wallet.getSigner()
      expect(def.isDerivable).toBe(true)
    })

    test('addSigner registers a signer retrievable via getSigner', async () => {
      const base = wallet.getSigner()
      const altSigner = await base.derive("0'/0/0")
      wallet.addSigner('alt', altSigner)

      const got = wallet.getSigner('alt')
      expect(got).toBe(altSigner)
    })

    test('getAccountByPath with signerName uses that signer and derives path', async () => {
      const altSigner = new SeedSignerBtc(SEED_PHRASE)
      wallet.addSigner('alt', altSigner)

      const acc = await wallet.getAccountByPath("1'/2/3", { signerName: 'alt' })
      expect(acc).toBeInstanceOf(WalletAccountBtc)
      expect(acc.path).toBe("m/84'/1'/1'/2/3")
    })

    test('getAccountByPath caches per signerName:path (same instance on repeat)', async () => {
      const acc1 = await wallet.getAccountByPath("0'/0/7")
      const acc2 = await wallet.getAccountByPath("0'/0/7")
      expect(acc2).toBe(acc1)
    })

    test('getAccountByPath does not collide across signer names with same path', async () => {
      const altSigner = new SeedSignerBtc(SEED_PHRASE)
      wallet.addSigner('alt', altSigner)

      const accDefault = await wallet.getAccountByPath("0'/0/5")
      const accAlt = await wallet.getAccountByPath("0'/0/5", { signerName: 'alt' })

      expect(accDefault).toBeInstanceOf(WalletAccountBtc)
      expect(accAlt).toBeInstanceOf(WalletAccountBtc)
      expect(accAlt).not.toBe(accDefault)

      expect(accDefault.path).toBe("m/84'/1'/0'/0/5")
      expect(accAlt.path).toBe("m/84'/1'/0'/0/5")
    })

    test('getAccountByPath throws for unknown signerName', async () => {
      await expect(wallet.getAccountByPath("0'/0/0", { signerName: 'ghost' }))
        .rejects.toThrow(/No signer registered with name "ghost"/)
    })
  })

  describe('getAccount overloads & guards', () => {
    test('constructor rejects a non-derivable default signer', () => {
      const pk = new PrivateKeySignerBtc(PRIVATE_KEY, { network: 'regtest' })
      expect(() => new WalletManagerBtc(pk)).toThrow(/must be derivable/)
      pk.dispose()
    })

    test('getAccount(name) derives a detached child for a derivable named signer', async () => {
      const altSigner = new SeedSignerBtc(SEED_PHRASE)
      wallet.addSigner('alt', altSigner)

      const acc = await wallet.getAccount('alt')
      expect(acc).toBeInstanceOf(WalletAccountBtc)
      // Defaults to the "0'/0/0" relative path when the signer has no path of its own.
      expect(acc.path).toBe("m/84'/1'/0'/0/0")
      // Cached per name#self.
      expect(await wallet.getAccount('alt')).toBe(acc)
    })

    test('getAccount(name) returns a non-derivable signer directly', async () => {
      const pk = new PrivateKeySignerBtc(PRIVATE_KEY, { network: 'regtest' })
      wallet.addSigner('pk', pk)

      const acc = await wallet.getAccount('pk')
      expect(acc).toBeInstanceOf(WalletAccountBtc)
      expect(await acc.getAddress()).toBe(pk.address)
    })

    test('getAccount(index, { signerName }) derives via the named signer', async () => {
      const altSigner = new SeedSignerBtc(SEED_PHRASE)
      wallet.addSigner('alt', altSigner)

      const acc = await wallet.getAccount(2, { signerName: 'alt' })
      expect(acc.path).toBe("m/84'/1'/0'/0/2")
    })
  })

  describe('backwards compatibility (seed string constructor)', () => {
    let seedWallet

    beforeEach(() => {
      seedWallet = new WalletManagerBtc(SEED_PHRASE)
    })

    afterEach(() => {
      seedWallet.dispose()
    })

    test('accepts a mnemonic string directly', () => {
      expect(seedWallet).toBeInstanceOf(WalletManagerBtc)
    })

    test('getAccount returns the same path as signer-based construction', async () => {
      const signerAccount = await wallet.getAccount()
      const seedAccount = await seedWallet.getAccount()

      expect(seedAccount).toBeInstanceOf(WalletAccountBtc)
      expect(seedAccount.path).toBe(signerAccount.path)
    })

    test('getAccountByPath works with seed-constructed wallet', async () => {
      const account = await seedWallet.getAccountByPath("1'/2/3")

      expect(account).toBeInstanceOf(WalletAccountBtc)
      expect(account.path).toBe("m/84'/1'/1'/2/3")
    })

    test('derived accounts produce the same address as signer-based flow', async () => {
      const signerAccount = await wallet.getAccount(0)
      const seedAccount = await seedWallet.getAccount(0)

      const signerAddr = await signerAccount.getAddress()
      const seedAddr = await seedAccount.getAddress()
      expect(seedAddr).toBe(signerAddr)
    })
  })
})
