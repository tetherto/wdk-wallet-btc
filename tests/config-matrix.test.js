import { describe, expect, test } from '@jest/globals'

import * as bip39 from 'bip39'

import { NoSuchElementError, ValueError } from '@tetherto/wdk-wallet'

import WalletManagerBtc, { WalletAccountBtc, WalletAccountReadOnlyBtc } from '../index.js'
import { PrivateKeySignerBtc, SeedSignerBtc } from '../src/signers/index.js'

const SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'

const PRIVATE_KEY = '15e083525dac99a2a9bba8f14a6eed9704a77c5994b1a9b4d7271ebd353b7966'

const XPRV = 'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi'
const REGTEST_TPRV = 'tprv8ZgxMBicQKsPdUJHScd9WVMci7rDF7NnwJGLESCz6m56EdD2DaYM4rwf7oMAuFkyLGUKs3qBm1vjjC892KoBt8ZGhh7yQ8e51EdXCxVbWHg'

const SEED_BYTES = bip39.mnemonicToSeedSync(SEED_PHRASE)
const PRIVATE_KEY_BYTES = Buffer.from(PRIVATE_KEY, 'hex')

const SEGWIT_COIN_NODE = 'bc1q82t6jj0td889z97r850zwm2x2mftf8d82cerxw'
const SEGWIT_ACCOUNT_0 = 'bc1qxn0te9ecv864wtu53cccjhuuy5dphvem6ykeyr'
const SEGWIT_ACCOUNT_1 = 'bc1qjkplk248q5u9ydezvtqk3kd3f2g8k0ag2tmqwn'
const SEGWIT_ACCOUNT_5 = 'bc1qh6u7fqlf92wth5endv0973z27j2yfwhey2pff4'
const SEGWIT_PRIVATE_KEY_ADDRESS = 'bc1q9lpn7ks92lekmr6m0gpy4qyzyq8g98nufpddma'
const SEGWIT_XPRV_ROOT = 'bc1qx3ppj0smkuy3d6g525sh9n2w9k7fm7q3x30rtg'

const LEGACY_COIN_NODE = '1HqWjBhB5nVQPwiVoqevJ3EqBX1BwhjdhK'
const LEGACY_ACCOUNT_0 = '14zf5SxNyHCLKcDviD1SA27k6mTsCNeBQV'
const LEGACY_ACCOUNT_1 = '1DWxhQaWx9FGVpVQ7A6SpGcDnst237EL91'
const LEGACY_ACCOUNT_5 = '1PEJwQ5LPgW6PNmwK7pFE54X9iLzztYVsh'
const LEGACY_PRIVATE_KEY_ADDRESS = '15MYf3n6zFiF4qJ5xAEbfstZFAniHN92Rx'
const LEGACY_XPRV_ROOT = '15mKKb2eos1hWa6tisdPwwDC1a5J1y9nma'

const CUSTOM_PATH_SEGWIT_ACCOUNT = 'bc1q8dqnpagwt9rtl7k38nuaa2ahf690avzkn3hdmf'
const CUSTOM_PATH_LEGACY_ACCOUNT = '15MYf3n6zFiF4qJ5xAEbfstZFAniHN92Rx'

const REGTEST_SEGWIT_COIN_NODE = 'bcrt1qkkmxq4ucwk7wn8aenmfrmjry7judzc7m87uely'
const REGTEST_SEGWIT_ACCOUNT_0 = 'bcrt1q8dqnpagwt9rtl7k38nuaa2ahf690avzkm74nhn'
const REGTEST_SEGWIT_PRIVATE_KEY_ADDRESS = 'bcrt1q9lpn7ks92lekmr6m0gpy4qyzyq8g98nupw0nh8'
const REGTEST_SEGWIT_TPRV_ROOT = 'bcrt1qrv0m8n0nhz0gy2fh3epfm9ljdda8q7x8nuefyq'
const REGTEST_LEGACY_COIN_NODE = 'mkrLCdNAo7oUYrT3kzhcR7dknjwMdxG5YU'
const REGTEST_LEGACY_ACCOUNT_0 = 'mjsVx6s5oH9VqwmhfjCyVo6t7APRGY6T8o'

describe('SeedSignerBtc constructor', () => {
  test('should default to bitcoin and segwit at the coin type node if only the seed is given', async () => {
    const signer = new SeedSignerBtc(SEED_PHRASE)

    expect(signer.network).toBe('bitcoin')
    expect(signer.type).toBe('segwit')
    expect(signer.path).toBe("m/84'/0'")
    expect(await signer.getAddress()).toBe(SEGWIT_COIN_NODE)

    signer.dispose()
  })

  test('should create a legacy signer at the coin type node if the type is legacy', async () => {
    const signer = new SeedSignerBtc(SEED_PHRASE, undefined, { type: 'legacy' })

    expect(signer.network).toBe('bitcoin')
    expect(signer.type).toBe('legacy')
    expect(signer.path).toBe("m/44'/0'")
    expect(await signer.getAddress()).toBe(LEGACY_COIN_NODE)

    signer.dispose()
  })

  test('should create the same signer from seed bytes as from a seed phrase', async () => {
    const signer = new SeedSignerBtc(SEED_BYTES)

    expect(signer.path).toBe("m/84'/0'")
    expect(await signer.getAddress()).toBe(SEGWIT_COIN_NODE)

    signer.dispose()
  })

  test('should create a signer at the given path if it agrees with the default configuration', async () => {
    const signer = new SeedSignerBtc(SEED_PHRASE, "m/84'/0'/0'/0/5")

    expect(signer.path).toBe("m/84'/0'/0'/0/5")
    expect(await signer.getAddress()).toBe(SEGWIT_ACCOUNT_5)

    signer.dispose()
  })

  test('should create a signer at the given path if it agrees with the legacy type', async () => {
    const signer = new SeedSignerBtc(SEED_PHRASE, "m/44'/0'/0'/0/5", { type: 'legacy' })

    expect(signer.path).toBe("m/44'/0'/0'/0/5")
    expect(await signer.getAddress()).toBe(LEGACY_ACCOUNT_5)

    signer.dispose()
  })

  test('should throw if the purpose of the path does not match the type', () => {
    expect(() => new SeedSignerBtc(SEED_PHRASE, "m/44'/0'", { type: 'segwit' })).toThrow(ValueError)
    expect(() => new SeedSignerBtc(SEED_PHRASE, "m/84'/0'", { type: 'legacy' })).toThrow(ValueError)
  })

  test('should throw if the coin type of the path does not match the network', () => {
    expect(() => new SeedSignerBtc(SEED_PHRASE, "m/84'/1'", { network: 'bitcoin' })).toThrow(ValueError)
    expect(() => new SeedSignerBtc(SEED_PHRASE, "m/84'/0'", { network: 'regtest' })).toThrow(ValueError)
  })

  test('should throw if the network is not supported', () => {
    expect(() => new SeedSignerBtc(SEED_PHRASE, undefined, { network: 'mainnet' })).toThrow(ValueError)
  })

  test('should throw if the type is not supported', () => {
    expect(() => new SeedSignerBtc(SEED_PHRASE, undefined, { type: 'bip84' })).toThrow(ValueError)
  })

  test('should create a regtest signer at the regtest coin type node', async () => {
    const signer = new SeedSignerBtc(SEED_PHRASE, undefined, { network: 'regtest' })

    expect(signer.network).toBe('regtest')
    expect(signer.path).toBe("m/84'/1'")
    expect(await signer.getAddress()).toBe(REGTEST_SEGWIT_COIN_NODE)

    signer.dispose()
  })
})

describe('custom derivation from a signer at the master path', () => {
  test('should derive a segwit account at a coin type that disagrees with the network', async () => {
    const root = new SeedSignerBtc(SEED_PHRASE, 'm')

    const signer = await root.derive("84'/1'/0'/0/0")

    expect(signer.network).toBe('bitcoin')
    expect(signer.path).toBe("m/84'/1'/0'/0/0")
    expect(await signer.getAddress()).toBe(CUSTOM_PATH_SEGWIT_ACCOUNT)

    signer.dispose()
    root.dispose()
  })

  test('should derive a legacy account at a coin type that disagrees with the network', async () => {
    const root = new SeedSignerBtc(SEED_PHRASE, 'm', { type: 'legacy' })

    const signer = await root.derive("44'/1'/0'/0/0")

    expect(signer.network).toBe('bitcoin')
    expect(signer.path).toBe("m/44'/1'/0'/0/0")
    expect(await signer.getAddress()).toBe(CUSTOM_PATH_LEGACY_ACCOUNT)

    signer.dispose()
    root.dispose()
  })

  test('should get the same custom account from a manager with a master path signer', async () => {
    const root = new SeedSignerBtc(SEED_PHRASE, 'm')
    const wallet = new WalletManagerBtc(root)

    const account = await wallet.getAccountByPath("84'/1'/0'/0/0")

    expect(account._config.network).toBe('bitcoin')
    expect(account.path).toBe("m/84'/1'/0'/0/0")
    expect(await account.getAddress()).toBe(CUSTOM_PATH_SEGWIT_ACCOUNT)

    wallet.dispose()
    root.dispose()
  })
})

describe('SeedSignerBtc.fromXprv', () => {
  test('should default to bitcoin and segwit if only the key is given', async () => {
    const signer = SeedSignerBtc.fromXprv(XPRV)

    expect(signer.network).toBe('bitcoin')
    expect(signer.type).toBe('segwit')
    expect(signer.path).toBe('/')
    expect(await signer.getAddress()).toBe(SEGWIT_XPRV_ROOT)

    signer.dispose()
  })

  test('should create a legacy signer if the type is legacy', async () => {
    const signer = SeedSignerBtc.fromXprv(XPRV, { type: 'legacy' })

    expect(signer.type).toBe('legacy')
    expect(signer.path).toBe('/')
    expect(await signer.getAddress()).toBe(LEGACY_XPRV_ROOT)

    signer.dispose()
  })

  test('should throw if the network is not supported', () => {
    expect(() => SeedSignerBtc.fromXprv(XPRV, { network: 'mainnet' })).toThrow(ValueError)
  })

  test('should throw if the type is not supported', () => {
    expect(() => SeedSignerBtc.fromXprv(XPRV, { type: 'bip84' })).toThrow(ValueError)
  })

  test('should throw if the key does not belong to the network', () => {
    expect(() => SeedSignerBtc.fromXprv(XPRV, { network: 'regtest' })).toThrow()
  })

  test('should create a regtest signer from a regtest key', async () => {
    const signer = SeedSignerBtc.fromXprv(REGTEST_TPRV, { network: 'regtest' })

    expect(signer.network).toBe('regtest')
    expect(signer.path).toBe('/')
    expect(await signer.getAddress()).toBe(REGTEST_SEGWIT_TPRV_ROOT)

    signer.dispose()
  })
})

describe('PrivateKeySignerBtc constructor', () => {
  test('should default to bitcoin and segwit, without a path, if only the key is given', async () => {
    const signer = new PrivateKeySignerBtc(PRIVATE_KEY)

    expect(signer.network).toBe('bitcoin')
    expect(signer.type).toBe('segwit')
    expect(signer.path).toBeNull()
    expect(await signer.getAddress()).toBe(SEGWIT_PRIVATE_KEY_ADDRESS)

    signer.dispose()
  })

  test('should create the same signer from key bytes as from a hex key', async () => {
    const signer = new PrivateKeySignerBtc(PRIVATE_KEY_BYTES)

    expect(await signer.getAddress()).toBe(SEGWIT_PRIVATE_KEY_ADDRESS)

    signer.dispose()
  })

  test('should create a legacy signer if the type is legacy', async () => {
    const signer = new PrivateKeySignerBtc(PRIVATE_KEY, { type: 'legacy' })

    expect(signer.type).toBe('legacy')
    expect(signer.path).toBeNull()
    expect(await signer.getAddress()).toBe(LEGACY_PRIVATE_KEY_ADDRESS)

    signer.dispose()
  })

  test('should throw if the network is not supported', () => {
    expect(() => new PrivateKeySignerBtc(PRIVATE_KEY, { network: 'mainnet' })).toThrow(ValueError)
  })

  test('should throw if the type is not supported', () => {
    expect(() => new PrivateKeySignerBtc(PRIVATE_KEY, { type: 'bip84' })).toThrow(ValueError)
  })

  test('should create a regtest signer if the network is regtest', async () => {
    const signer = new PrivateKeySignerBtc(PRIVATE_KEY, { network: 'regtest' })

    expect(signer.network).toBe('regtest')
    expect(await signer.getAddress()).toBe(REGTEST_SEGWIT_PRIVATE_KEY_ADDRESS)

    signer.dispose()
  })
})

describe('WalletAccountBtc constructor with a seed, a path and a configuration', () => {
  test('should append the path to the default prefix', async () => {
    const account = new WalletAccountBtc(SEED_PHRASE, "0'/0/5")

    expect(account.path).toBe("m/84'/0'/0'/0/5")
    expect(await account.getAddress()).toBe(SEGWIT_ACCOUNT_5)

    account.dispose()
  })

  test('should append the path to the legacy prefix if the type is legacy', async () => {
    const account = new WalletAccountBtc(SEED_PHRASE, "0'/0/5", { type: 'legacy' })

    expect(account.path).toBe("m/44'/0'/0'/0/5")
    expect(await account.getAddress()).toBe(LEGACY_ACCOUNT_5)

    account.dispose()
  })

  test('should throw if the path is absolute', () => {
    expect(() => new WalletAccountBtc(SEED_PHRASE, "m/0'/0/0", {})).toThrow(ValueError)
  })

  test('should throw if the network is not supported', () => {
    expect(() => new WalletAccountBtc(SEED_PHRASE, "0'/0/0", { network: 'mainnet' })).toThrow(ValueError)
  })

  test('should throw if the type is not supported', () => {
    expect(() => new WalletAccountBtc(SEED_PHRASE, "0'/0/0", { type: 'bip84' })).toThrow(ValueError)
  })

  test('should create a regtest account if the network is regtest', async () => {
    const account = new WalletAccountBtc(SEED_PHRASE, "0'/0/0", { network: 'regtest' })

    expect(account.path).toBe("m/84'/1'/0'/0/0")
    expect(await account.getAddress()).toBe(REGTEST_SEGWIT_ACCOUNT_0)

    account.dispose()
  })
})

describe('WalletAccountBtc constructor with a seed and a configuration', () => {
  test('should default to the first bitcoin segwit account if the configuration is omitted', async () => {
    const account = new WalletAccountBtc(SEED_PHRASE)

    expect(account.path).toBe("m/84'/0'/0'/0/0")
    expect(await account.getAddress()).toBe(SEGWIT_ACCOUNT_0)

    account.dispose()
  })

  test('should default to the first bitcoin segwit account if the configuration is empty', async () => {
    const account = new WalletAccountBtc(SEED_PHRASE, {})

    expect(account.path).toBe("m/84'/0'/0'/0/0")
    expect(await account.getAddress()).toBe(SEGWIT_ACCOUNT_0)

    account.dispose()
  })

  test('should create the first legacy account if the type is legacy', async () => {
    const account = new WalletAccountBtc(SEED_PHRASE, { type: 'legacy' })

    expect(account.path).toBe("m/44'/0'/0'/0/0")
    expect(await account.getAddress()).toBe(LEGACY_ACCOUNT_0)

    account.dispose()
  })

  test('should create the same account from seed bytes as from a seed phrase', async () => {
    const account = new WalletAccountBtc(SEED_BYTES)

    expect(account.path).toBe("m/84'/0'/0'/0/0")
    expect(await account.getAddress()).toBe(SEGWIT_ACCOUNT_0)

    account.dispose()
  })

  test('should throw if the network is not supported', () => {
    expect(() => new WalletAccountBtc(SEED_PHRASE, { network: 'mainnet' })).toThrow(ValueError)
  })

  test('should throw if the type is not supported', () => {
    expect(() => new WalletAccountBtc(SEED_PHRASE, { type: 'bip84' })).toThrow(ValueError)
  })

  test('should create a regtest account if the network is regtest', async () => {
    const account = new WalletAccountBtc(SEED_PHRASE, { network: 'regtest' })

    expect(account.path).toBe("m/84'/1'/0'/0/0")
    expect(await account.getAddress()).toBe(REGTEST_SEGWIT_ACCOUNT_0)

    account.dispose()
  })
})

describe('WalletAccountBtc constructor with a signer and a configuration', () => {
  test('should take the address, the path and the network from the signer', async () => {
    const signer = new SeedSignerBtc(SEED_PHRASE, undefined, { network: 'regtest', type: 'legacy' })

    const account = new WalletAccountBtc(signer)

    expect(account.path).toBe("m/44'/1'")
    expect(await account.getAddress()).toBe(REGTEST_LEGACY_COIN_NODE)
    expect(account._config.network).toBe('regtest')

    account.dispose()
    signer.dispose()
  })

  test('should take the network and the type from the signer, not from the configuration', async () => {
    const signer = new SeedSignerBtc(SEED_PHRASE, undefined, { network: 'regtest', type: 'legacy' })

    const account = new WalletAccountBtc(signer, { network: 'bitcoin', type: 'segwit' })

    expect(account.path).toBe("m/44'/1'")
    expect(await account.getAddress()).toBe(REGTEST_LEGACY_COIN_NODE)
    expect(account._config.network).toBe('regtest')
    expect(account._config.type).toBeUndefined()

    account.dispose()
    signer.dispose()
  })
})

describe('WalletAccountBtc.fromPrivateKey', () => {
  test('should default to bitcoin and segwit, without a path, if only the key is given', async () => {
    const account = WalletAccountBtc.fromPrivateKey(PRIVATE_KEY)

    expect(account.path).toBeNull()
    expect(await account.getAddress()).toBe(SEGWIT_PRIVATE_KEY_ADDRESS)

    account.dispose()
  })

  test('should create the same account from key bytes as from a hex key', async () => {
    const account = WalletAccountBtc.fromPrivateKey(PRIVATE_KEY_BYTES)

    expect(await account.getAddress()).toBe(SEGWIT_PRIVATE_KEY_ADDRESS)

    account.dispose()
  })

  test('should create a legacy account if the type is legacy', async () => {
    const account = WalletAccountBtc.fromPrivateKey(PRIVATE_KEY, { type: 'legacy' })

    expect(account.path).toBeNull()
    expect(await account.getAddress()).toBe(LEGACY_PRIVATE_KEY_ADDRESS)

    account.dispose()
  })

  test('should throw if the network is not supported', () => {
    expect(() => WalletAccountBtc.fromPrivateKey(PRIVATE_KEY, { network: 'mainnet' })).toThrow(ValueError)
  })

  test('should throw if the type is not supported', () => {
    expect(() => WalletAccountBtc.fromPrivateKey(PRIVATE_KEY, { type: 'bip84' })).toThrow(ValueError)
  })

  test('should create a regtest account if the network is regtest', async () => {
    const account = WalletAccountBtc.fromPrivateKey(PRIVATE_KEY, { network: 'regtest' })

    expect(await account.getAddress()).toBe(REGTEST_SEGWIT_PRIVATE_KEY_ADDRESS)

    account.dispose()
  })
})

describe('WalletManagerBtc constructor with a seed and a configuration', () => {
  test('should derive bitcoin segwit accounts by default if the configuration is omitted', async () => {
    const wallet = new WalletManagerBtc(SEED_PHRASE)

    const account = await wallet.getAccount(1)

    expect(account.path).toBe("m/84'/0'/0'/0/1")
    expect(await account.getAddress()).toBe(SEGWIT_ACCOUNT_1)

    wallet.dispose()
  })

  test('should derive legacy accounts if the type is legacy', async () => {
    const wallet = new WalletManagerBtc(SEED_PHRASE, { type: 'legacy' })

    const account = await wallet.getAccount(1)

    expect(account.path).toBe("m/44'/0'/0'/0/1")
    expect(await account.getAddress()).toBe(LEGACY_ACCOUNT_1)

    wallet.dispose()
  })

  test('should throw if the network is not supported', () => {
    expect(() => new WalletManagerBtc(SEED_PHRASE, { network: 'mainnet' })).toThrow(ValueError)
  })

  test('should throw if the type is not supported', () => {
    expect(() => new WalletManagerBtc(SEED_PHRASE, { type: 'bip84' })).toThrow(ValueError)
  })

  test('should derive regtest accounts if the network is regtest', async () => {
    const wallet = new WalletManagerBtc(SEED_PHRASE, { network: 'regtest' })

    const account = await wallet.getAccount(0)

    expect(account.path).toBe("m/84'/1'/0'/0/0")
    expect(await account.getAddress()).toBe(REGTEST_SEGWIT_ACCOUNT_0)

    wallet.dispose()
  })
})

describe('WalletManagerBtc constructor with a signer and a configuration', () => {
  test('should derive accounts of the type and the network of the signer', async () => {
    const signer = new SeedSignerBtc(SEED_PHRASE, undefined, { network: 'regtest', type: 'legacy' })
    const wallet = new WalletManagerBtc(signer)

    const account = await wallet.getAccount(0)

    expect(wallet._config.network).toBe('regtest')
    expect(account.path).toBe("m/44'/1'/0'/0/0")
    expect(await account.getAddress()).toBe(REGTEST_LEGACY_ACCOUNT_0)
    expect(account._config.network).toBe('regtest')

    wallet.dispose()
    signer.dispose()
  })

  test('should take the network and the type from the signer, not from the configuration', async () => {
    const signer = new SeedSignerBtc(SEED_PHRASE, undefined, { network: 'regtest', type: 'legacy' })
    const wallet = new WalletManagerBtc(signer, { network: 'bitcoin', type: 'segwit' })

    const account = await wallet.getAccount(0)

    expect(wallet._config.network).toBe('regtest')
    expect(wallet._config.type).toBeUndefined()
    expect(account.path).toBe("m/44'/1'/0'/0/0")
    expect(await account.getAddress()).toBe(REGTEST_LEGACY_ACCOUNT_0)
    expect(account._config.network).toBe('regtest')
    expect(account._config.type).toBeUndefined()

    wallet.dispose()
    signer.dispose()
  })
})

describe('WalletManagerBtc.addSigner', () => {
  test('should register a signer of the same network and of another type', async () => {
    const wallet = new WalletManagerBtc(SEED_PHRASE)
    const signer = new PrivateKeySignerBtc(PRIVATE_KEY, { type: 'legacy' })

    wallet.addSigner('imported', signer)
    const account = await wallet.getAccount('imported')

    expect(await account.getAddress()).toBe(LEGACY_PRIVATE_KEY_ADDRESS)

    wallet.dispose()
    signer.dispose()
  })

  test('should throw if a regtest signer is added to a mainnet wallet', () => {
    const wallet = new WalletManagerBtc(SEED_PHRASE)
    const signer = new PrivateKeySignerBtc(PRIVATE_KEY, { network: 'regtest' })

    expect(() => wallet.addSigner('imported', signer)).toThrow(ValueError)

    wallet.dispose()
    signer.dispose()
  })

  test('should throw if a mainnet signer is added to a regtest wallet', () => {
    const wallet = new WalletManagerBtc(SEED_PHRASE, { network: 'regtest' })
    const signer = new PrivateKeySignerBtc(PRIVATE_KEY)

    expect(() => wallet.addSigner('imported', signer)).toThrow(ValueError)

    wallet.dispose()
    signer.dispose()
  })

  test('should not register a signer that is rejected', async () => {
    const wallet = new WalletManagerBtc(SEED_PHRASE)
    const signer = new PrivateKeySignerBtc(PRIVATE_KEY, { network: 'regtest' })

    expect(() => wallet.addSigner('imported', signer)).toThrow(ValueError)

    await expect(wallet.getAccount('imported')).rejects.toThrow(NoSuchElementError)

    wallet.dispose()
    signer.dispose()
  })
})

describe('WalletAccountReadOnlyBtc constructor', () => {
  test('should default the network to bitcoin if the configuration is omitted', () => {
    const account = new WalletAccountReadOnlyBtc(SEGWIT_ACCOUNT_0)

    expect(account._config.network).toBe('bitcoin')
  })

  test('should throw if the network is not supported', () => {
    expect(() => new WalletAccountReadOnlyBtc(SEGWIT_ACCOUNT_0, { network: 'mainnet' })).toThrow(ValueError)
  })

  test('should use the network of the configuration', () => {
    const account = new WalletAccountReadOnlyBtc(REGTEST_SEGWIT_ACCOUNT_0, { network: 'regtest' })

    expect(account._config.network).toBe('regtest')
  })
})

describe('removed bip option', () => {
  test.each([
    ['WalletAccountBtc with a seed', () => new WalletAccountBtc(SEED_PHRASE, { bip: 44 })],
    [
      'WalletAccountBtc with a signer',
      () => new WalletAccountBtc(new SeedSignerBtc(SEED_PHRASE), { bip: 44 })
    ],
    ['WalletAccountReadOnlyBtc', () => new WalletAccountReadOnlyBtc(SEGWIT_ACCOUNT_0, { bip: 44 })],
    ['WalletAccountBtc.fromPrivateKey', () => WalletAccountBtc.fromPrivateKey(PRIVATE_KEY, { bip: 44 })],
    ['WalletManagerBtc with a seed', () => new WalletManagerBtc(SEED_PHRASE, { bip: 44 })]
  ])('should throw if the removed bip option is given to %s', (name, build) => {
    expect(build).toThrow(ValueError)
    expect(build).toThrow("The 'bip' option was removed. Use type: 'legacy' (BIP-44) or 'segwit' (BIP-84).")
  })
})
