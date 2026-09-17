import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals'

import { HOST, PORT, ELECTRUM_PORT, ZMQ_PORT, DATA_DIR } from './config.js'

import { BitcoinCli, Waiter } from './helpers/index.js'

import { InvalidSignerError, NoSuchElementError, UnsupportedOperationError } from '@tetherto/wdk-wallet'

import WalletManagerBtc, { WalletAccountBtc } from '../index.js'
import SeedSignerBtc, { PrivateKeySignerBtc } from '../src/signers/index.js'

const SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'

// Derived independently of the wallet's seed; registered as a named signer in tests.
const PRIVATE_KEY = '15e083525dac99a2a9bba8f14a6eed9704a77c5994b1a9b4d7271ebd353b7966'
const PRIVATE_KEY_ADDRESS = 'bc1q9lpn7ks92lekmr6m0gpy4qyzyq8g98nufpddma'

// The regtest address of the default account ("m/84'/1'/0'/0/0") for SEED_PHRASE.
const REGTEST_ACCOUNT_0_ADDRESS = 'bcrt1q8dqnpagwt9rtl7k38nuaa2ahf690avzkm74nhn'

const NON_DERIVABLE_SIGNER_MESSAGE = 'The default signer must be derivable. Non-derivable signers (e.g. private-key signers) can only be registered by name via addSigner.'

describe('WalletManagerBtc', () => {
  let wallet

  beforeEach(() => {
    const root = new SeedSignerBtc(SEED_PHRASE, "m/84'/1'")
    wallet = new WalletManagerBtc(root)
  })

  afterEach(() => {
    wallet.dispose()
  })

  describe('constructor', () => {
    test('should throw if the default signer is not derivable', () => {
      const pk = new PrivateKeySignerBtc(PRIVATE_KEY)

      expect(() => new WalletManagerBtc(pk)) // eslint-disable-line no-new
        .toThrow(InvalidSignerError)
      expect(() => new WalletManagerBtc(pk)) // eslint-disable-line no-new
        .toThrow(NON_DERIVABLE_SIGNER_MESSAGE)

      pk.dispose()
    })

    test('should throw if the default signer is a bare ISigner without isDerivable', () => {
      const bareSigner = { derive: async () => {}, signPsbt: async () => {}, getAddress: async () => '', dispose: () => {} }

      expect(() => new WalletManagerBtc(bareSigner)) // eslint-disable-line no-new
        .toThrow(InvalidSignerError)
      expect(() => new WalletManagerBtc(bareSigner)) // eslint-disable-line no-new
        .toThrow(NON_DERIVABLE_SIGNER_MESSAGE)
    })
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

    test('should return the same cached account instance for the same index', async () => {
      const first = await wallet.getAccount(1)
      const second = await wallet.getAccount(1)

      expect(second).toBe(first)
    })

    test('should throw if the index is a negative number', async () => {
      await expect(wallet.getAccount(-1))
        .rejects.toThrow(`Invalid format: Expected /^(m\\/)?(\\d+'?\\/)*\\d+'?$/ but received "0'/0/-1"`)
    })

    test('should derive from a named signer via options.signerName', async () => {
      wallet.addSigner('secondary', new SeedSignerBtc(SEED_PHRASE, "m/84'/1'"))

      const account = await wallet.getAccount(2, { signerName: 'secondary' })

      expect(account).toBeInstanceOf(WalletAccountBtc)
      expect(account.path).toBe("m/84'/1'/0'/0/2")
    })

    test('should throw if the named signer does not exist', async () => {
      const promise = wallet.getAccount(0, { signerName: 'missing' })

      await expect(promise).rejects.toThrow(NoSuchElementError)
      await expect(promise).rejects.toThrow('No signer found with name "missing".')
    })

    test('should return the account of a named private key signer (string overload)', async () => {
      wallet.addSigner('hot', new PrivateKeySignerBtc(PRIVATE_KEY))

      const account = await wallet.getAccount('hot')

      expect(account).toBeInstanceOf(WalletAccountBtc)
      expect(await account.getAddress()).toBe(PRIVATE_KEY_ADDRESS)
    })

    test('should throw if the named signer does not exist (string overload)', async () => {
      const promise = wallet.getAccount('missing')

      await expect(promise).rejects.toThrow(NoSuchElementError)
      await expect(promise).rejects.toThrow('No signer found with name "missing".')
    })

    test('should use the named signer as given without taking ownership of it', async () => {
      const named = new SeedSignerBtc(SEED_PHRASE)
      wallet.addSigner('seed', named)

      const account = await wallet.getAccount('seed')

      expect(account).toBeInstanceOf(WalletAccountBtc)
      expect(account.path).toBe("m/84'/1'/0'/0/0")

      // The registered signer is wrapped as-is but stays consumer-owned, so disposing
      // the returned account must leave the signer fully usable.
      account.dispose()
      await expect(named.derive('0')).resolves.toBeInstanceOf(SeedSignerBtc)

      named.dispose()
    })

    test('should mirror the registered signer\'s own (non-default) path', async () => {
      wallet.addSigner('atFive', new SeedSignerBtc(SEED_PHRASE, "m/84'/1'/0'/0/5"))

      const account = await wallet.getAccount('atFive')

      expect(account.path).toBe("m/84'/1'/0'/0/5")
    })
  })

  describe('getAccountByPath', () => {
    test('should return the account with the given path', async () => {
      const account = await wallet.getAccountByPath("1'/2/3")

      expect(account).toBeInstanceOf(WalletAccountBtc)

      expect(account.path).toBe("m/84'/1'/1'/2/3")
    })

    test('should return the same cached account instance for the same path', async () => {
      const first = await wallet.getAccountByPath("0'/0/7")
      const second = await wallet.getAccountByPath("0'/0/7")

      expect(second).toBe(first)
    })

    test('should derive from a named signer via options.signerName', async () => {
      wallet.addSigner('secondary', new SeedSignerBtc(SEED_PHRASE, "m/84'/1'"))

      const account = await wallet.getAccountByPath("0'/0/0", { signerName: 'secondary' })

      expect(account.path).toBe("m/84'/1'/0'/0/0")
    })

    test('should not collide across signer names with the same path', async () => {
      wallet.addSigner('secondary', new SeedSignerBtc(SEED_PHRASE, "m/84'/1'"))

      const accountDefault = await wallet.getAccountByPath("0'/0/5")
      const accountNamed = await wallet.getAccountByPath("0'/0/5", { signerName: 'secondary' })

      expect(accountNamed).not.toBe(accountDefault)
      expect(accountDefault.path).toBe("m/84'/1'/0'/0/5")
      expect(accountNamed.path).toBe("m/84'/1'/0'/0/5")
    })

    test('should throw if the path is invalid', async () => {
      await expect(wallet.getAccountByPath("a'/b/c"))
        .rejects.toThrow(`Invalid format: Expected /^(m\\/)?(\\d+'?\\/)*\\d+'?$/ but received "a'/b/c"`)
    })

    test('should throw when deriving from a named private key signer', async () => {
      wallet.addSigner('hot', new PrivateKeySignerBtc(PRIVATE_KEY))

      const promise = wallet.getAccountByPath("0'/0/0", { signerName: 'hot' })

      await expect(promise).rejects.toThrow(UnsupportedOperationError)
      await expect(promise).rejects.toThrow("Method 'derive(path)' is not supported.")
    })

    test('should propagate the wallet configuration to derived accounts', async () => {
      const bitcoin = new BitcoinCli({
        host: HOST,
        port: PORT,
        zmqPort: ZMQ_PORT,
        dataDir: DATA_DIR,
        wallet: 'testwallet'
      })
      const waiter = new Waiter(bitcoin, { host: HOST, electrumPort: ELECTRUM_PORT, zmqPort: ZMQ_PORT })

      const wallet = new WalletManagerBtc(SEED_PHRASE, {
        network: 'regtest',
        transactionMaxFee: 0,
        client: { type: 'electrum', clientConfig: { host: HOST, port: ELECTRUM_PORT } }
      })

      const account = await wallet.getAccount(0)
      bitcoin.sendToAddress(REGTEST_ACCOUNT_0_ADDRESS, 0.01)
      await waiter.mine()

      const recipient = bitcoin.getNewAddress()
      await expect(account.sendTransaction({ to: recipient, value: 1_000, feeRate: 1 }))
        .rejects.toThrow('Exceeded maximum fee cost for transaction operation.')

      const account1 = await wallet.getAccount(1)

      expect(account1._config.network).toBe('regtest')
      expect(account1._config.transactionMaxFee).toBe(0)
      expect(account1._config.client).toBe(wallet._clientList)

      wallet.dispose()
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

  describe('dispose', () => {
    test('should dispose the wallet and erase the private keys of the accounts', async () => {
      const account0 = await wallet.getAccount(0)
      const account1 = await wallet.getAccount(1)

      wallet.dispose()

      const MESSAGE = 'Hello, world!'

      for (const account of [account0, account1]) {
        expect(account.keyPair.privateKey).toBeNull()

        // Once disposed, the underlying signer is cleared, so any signing operation
        // fails when it reaches the now-undefined signer rather than for some other reason.
        await expect(account.sign(MESSAGE))
          .rejects.toThrow(/Cannot read properties of undefined \(reading 'privateKey'\)/)
      }
    })

    test('should dispose the internally created default signer when constructed from a seed', () => {
      const wallet = new WalletManagerBtc(SEED_PHRASE)
      const defaultSigner = wallet.getSigner()

      wallet.dispose()

      expect(defaultSigner.keyPair.privateKey).toBeNull()
    })

    test('should not dispose a default signer supplied at construction', async () => {
      const root = new SeedSignerBtc(SEED_PHRASE, "m/84'/1'")
      const wallet = new WalletManagerBtc(root)

      wallet.dispose()

      // The consumer still owns the signer, so it must remain fully usable.
      await expect(root.derive("0'/0/0")).resolves.toBeInstanceOf(SeedSignerBtc)

      root.dispose()
    })

    test('should not dispose signers registered via addSigner', () => {
      const named = new SeedSignerBtc(SEED_PHRASE)
      wallet.addSigner('seed', named)

      wallet.dispose()

      expect(named.keyPair.privateKey).not.toBeNull()

      named.dispose()
    })

    test('should not close externally provided clients', () => {
      const externalClient = { connect: jest.fn(), close: jest.fn() }
      const wallet = new WalletManagerBtc(SEED_PHRASE, { client: externalClient })

      wallet.dispose()

      expect(externalClient.close).not.toHaveBeenCalled()
    })

    test('should be safe to call dispose more than once', () => {
      const wallet = new WalletManagerBtc(SEED_PHRASE)

      wallet.dispose()

      expect(() => wallet.dispose()).not.toThrow()
    })
  })
})
