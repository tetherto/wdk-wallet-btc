import { describe, expect, test } from '@jest/globals'

import { Psbt, networks, address as btcAddress } from 'bitcoinjs-lib'

import SeedSignerBtc from '../src/signers/seed-signer-btc.js'
import PrivateKeySignerBtc from '../src/signers/private-key-signer-btc.js'

const VALID_SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'
const VALID_PRIVATE_KEY = '15e083525dac99a2a9bba8f14a6eed9704a77c5994b1a9b4d7271ebd353b7966'
const MESSAGE = 'Dummy message to sign.'

const PK_CONFIG = { bip: 44, network: 'regtest' }
const PK_EXPECTED_ADDRESS = 'mjsVx6s5oH9VqwmhfjCyVo6t7APRGY6T8o'
const PK_EXPECTED_SIGNATURE = 'H4RwJWJzRmVkgQDqmTgX0qCbSONLQjvjfXH7ZdKZs5S3BWbpfjqbGdIJQXy/+ppW4Lvaw0wZ/UaDOLhMw5TIDuk='

const SEED_CONFIG = { network: 'regtest' }
const SEED_EXPECTED_SIGNATURE = 'KAVgsxrQT5V4Mhfnk6taeCN1/j8p/sa8S9iNsbsgRb8zbfNOOPXV1w3dQQV0IjboJrlxYuDJnHw5a/E6vRJ+0Ek='

// Address of the default account ("0'/0/0") for VALID_SEED_PHRASE on mainnet (bip84).
const SEED_DEFAULT_ADDRESS = 'bc1q8dqnpagwt9rtl7k38nuaa2ahf690avzkn3hdmf'
// Extended public keys (tpub) for VALID_SEED_PHRASE on regtest (bip84).
const SEED_REGTEST_XPUB = 'tpubDFzkKtmo97eBEPmF6sPJ4nzJPMYPDHuJPhARSReXWt7XBL6dQ61WTXTB8AtKDznckydrPAWtJRqHwxyvEZXudXxRJrphpU3ahFyiBR88QkQ'
const SEED_REGTEST_CHILD_001_XPUB = 'tpubDFzkKtmo97eBGKELLKV8WtugMAEfx7hGyc5ZWWngQZGPVaTv8acKJ64rfFUeLiaCGkA77J3XJ6XSJ4GVKWCydKRTkkNSYG9zB4X1eAuNtuz'

// Foreign (not-ours) regtest address used to add an unrelated PSBT input/output.
const PSBT_FOREIGN_ADDRESS = 'bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080'

/**
 * Builds an in-memory PSBT with two SegWit inputs: input 0 is owned by `signer`, input 1 belongs
 * to an unrelated script. Lets us exercise signPsbt fully offline (no UTXO fetch / regtest harness).
 */
function buildMixedPsbt (signer) {
  const network = networks.regtest
  const myScript = btcAddress.toOutputScript(signer.address, network)
  const foreignScript = btcAddress.toOutputScript(PSBT_FOREIGN_ADDRESS, network)
  const psbt = new Psbt({ network })
  psbt.addInput({ hash: '11'.repeat(32), index: 0, witnessUtxo: { script: myScript, value: 100000 } })
  psbt.addInput({ hash: '22'.repeat(32), index: 1, witnessUtxo: { script: foreignScript, value: 50000 } })
  psbt.addOutput({ address: PSBT_FOREIGN_ADDRESS, value: 90000 })
  return psbt
}

describe('SeedSignerBtc', () => {
  test('should throw if the seed phrase is invalid', () => {
    expect(() => new SeedSignerBtc('invalid seed phrase'))
      .toThrow('The seed phrase is invalid.')
  })

  test('should throw if the path is invalid', () => {
    expect(() => new SeedSignerBtc(VALID_SEED_PHRASE, {}, { path: "a'/b/c" }))
      .toThrow(/Expected BIP32Path/)
  })

  test('should throw for unsupported bip specifications', () => {
    expect(() => new SeedSignerBtc(VALID_SEED_PHRASE, { bip: 1 }))
      .toThrow(/Invalid bip specification/)
  })

  test('should create a derivable root signer with a default account', () => {
    const signer = new SeedSignerBtc(VALID_SEED_PHRASE)
    expect(signer.isDerivable).toBe(true)
    // A root always holds an account, defaulting to "0'/0/0", so it can back a wallet account.
    expect(signer.path).toBe("m/84'/1'/0'/0/0")
    expect(signer.index).toBe(0)
    expect(signer.address).toBe(SEED_DEFAULT_ADDRESS)
    signer.dispose()
  })

  test('should derive a detached (non-derivable) child signer from a root signer', async () => {
    const root = new SeedSignerBtc(VALID_SEED_PHRASE)
    const child = await root.derive("0'/0/0")
    expect(child.isDerivable).toBe(false)
    expect(child.address).toBe(SEED_DEFAULT_ADDRESS)
    expect(child.path).toMatch(/^m\/84'\/1'\/0'\/0\/0$/)
    // A detached child cannot derive further.
    await expect(child.derive("0'/0/1")).rejects.toThrow()
    child.dispose()
    root.dispose()
  })

  test('should reject deriving from a disposed signer', async () => {
    const root = new SeedSignerBtc(VALID_SEED_PHRASE)
    root.dispose()
    await expect(root.derive("0'/0/0")).rejects.toThrow()
  })

  test('should sign a message', async () => {
    const signer = new SeedSignerBtc(VALID_SEED_PHRASE, SEED_CONFIG, { path: "0'/0/0" })
    const sig = await signer.sign(MESSAGE)
    expect(sig).toBe(SEED_EXPECTED_SIGNATURE)
    signer.dispose()
  })

  test('getExtendedPublicKey returns the account tpub on regtest', async () => {
    const signer = new SeedSignerBtc(VALID_SEED_PHRASE, SEED_CONFIG)
    expect(await signer.getExtendedPublicKey()).toBe(SEED_REGTEST_XPUB)
    signer.dispose()
  })

  test('getExtendedPublicKey reflects the derived child account', async () => {
    const root = new SeedSignerBtc(VALID_SEED_PHRASE, SEED_CONFIG)
    const child = await root.derive("0'/0/1")
    expect(await child.getExtendedPublicKey()).toBe(SEED_REGTEST_CHILD_001_XPUB)
    child.dispose()
    root.dispose()
  })

  test('signPsbt signs owned inputs and leaves foreign inputs untouched', async () => {
    const signer = new SeedSignerBtc(VALID_SEED_PHRASE, SEED_CONFIG)
    const signed = await signer.signPsbt(buildMixedPsbt(signer))
    expect(typeof signed).toBe('string')

    const parsed = Psbt.fromBase64(signed)
    expect(parsed.data.inputs[0].partialSig).toHaveLength(1)
    expect(parsed.data.inputs[0].partialSig[0].pubkey.toString('hex'))
      .toBe('02e928d54a04833586b14e9c910884f589aebdc713a055e655c2fa13306c1b4f7f')
    expect(parsed.data.inputs[0].partialSig[0].signature.toString('hex'))
      .toBe('3045022100bb13449bdd3b7c10817339e6dd22c276a205c744b5315fc8df94d2ddf1897681022011f945492c4b9607426124f0f0129dd2fb50344990ad93b134e1a06f9307191c01')
    // The foreign input must be left unsigned (skipped by the ownership filter).
    expect(parsed.data.inputs[1].partialSig).toBeUndefined()
    signer.dispose()
  })

  test('dispose should zero the private key material', () => {
    const signer = new SeedSignerBtc(VALID_SEED_PHRASE, {}, { path: "0'/0/0" })
    const kp = signer.keyPair
    expect(kp.privateKey).not.toBeNull()

    signer.dispose()

    expect(signer.keyPair.privateKey).toBeNull()
    expect(signer._masterNode).toBeUndefined()
  })
})

describe('PrivateKeySignerBtc', () => {
  test('should throw if the private key is too short', () => {
    expect(() => new PrivateKeySignerBtc('aabb'))
      .toThrow('PrivateKeySignerBtc: privateKey must be 32-byte Buffer or 64-char hex')
  })

  test('should throw if the private key is too long', () => {
    const longKey = 'ff'.repeat(33)
    expect(() => new PrivateKeySignerBtc(longKey))
      .toThrow('PrivateKeySignerBtc: privateKey must be 32-byte Buffer or 64-char hex')
  })

  test('should throw for unsupported bip specifications', () => {
    expect(() => new PrivateKeySignerBtc(VALID_PRIVATE_KEY, { bip: 1 }))
      .toThrow(/Invalid bip specification/)
  })

  test('should accept a hex string', () => {
    const signer = new PrivateKeySignerBtc(VALID_PRIVATE_KEY, PK_CONFIG)
    expect(signer.address).toBe(PK_EXPECTED_ADDRESS)
    signer.dispose()
  })

  test('should accept a Buffer', () => {
    const buf = Buffer.from(VALID_PRIVATE_KEY, 'hex')
    const signer = new PrivateKeySignerBtc(buf, PK_CONFIG)
    expect(signer.address).toBe(PK_EXPECTED_ADDRESS)
    signer.dispose()
  })

  test('should accept a Uint8Array (zero-copy)', () => {
    const arr = new Uint8Array(Buffer.from(VALID_PRIVATE_KEY, 'hex'))
    const signer = new PrivateKeySignerBtc(arr, PK_CONFIG)
    expect(signer.address).toBe(PK_EXPECTED_ADDRESS)
    signer.dispose()
  })

  test('should sign a message', async () => {
    const signer = new PrivateKeySignerBtc(VALID_PRIVATE_KEY, PK_CONFIG)
    const sig = await signer.sign(MESSAGE)
    expect(sig).toBe(PK_EXPECTED_SIGNATURE)
    signer.dispose()
  })

  test('signPsbt signs owned inputs and leaves foreign inputs untouched', async () => {
    const signer = new PrivateKeySignerBtc(VALID_PRIVATE_KEY, { bip: 84, network: 'regtest' })
    const signed = await signer.signPsbt(buildMixedPsbt(signer))
    expect(typeof signed).toBe('string')

    const parsed = Psbt.fromBase64(signed)
    expect(parsed.data.inputs[0].partialSig).toHaveLength(1)
    expect(parsed.data.inputs[0].partialSig[0].pubkey.toString('hex'))
      .toBe('02f8044c82d6b9dfcfc3e6f3424cb11cc747bb34766bcbef72d2f52f6c4e8e07aa')
    expect(parsed.data.inputs[0].partialSig[0].signature.toString('hex'))
      .toBe('3045022100baf90a97ad07d0cd320ad9c4e7028eb52f9f02b4b87bbb399c4883b324e78ff202204ed486957a17a03bc5cf96a13acdf6b05cc7ac18bc1a61d5d29806cd0f8cb78401')
    expect(parsed.data.inputs[1].partialSig).toBeUndefined()
    signer.dispose()
  })

  test('getExtendedPublicKey is unavailable for imported keys', async () => {
    const signer = new PrivateKeySignerBtc(VALID_PRIVATE_KEY)
    await expect(signer.getExtendedPublicKey()).rejects.toThrow('Extended public key is unavailable')
    signer.dispose()
  })

  test('is not derivable and exposes undefined index/path', () => {
    const signer = new PrivateKeySignerBtc(VALID_PRIVATE_KEY)
    expect(signer.isDerivable).toBe(false)
    expect(signer.index).toBeUndefined()
    expect(signer.path).toBeUndefined()
    signer.dispose()
  })

  test('should reject derive()', async () => {
    const signer = new PrivateKeySignerBtc(VALID_PRIVATE_KEY)
    await expect(signer.derive()).rejects.toThrow('does not support derivation')
    signer.dispose()
  })

  test('dispose should zero the private key material', () => {
    const signer = new PrivateKeySignerBtc(VALID_PRIVATE_KEY)
    const kp = signer.keyPair
    expect(kp.privateKey).not.toBeNull()
    const allZeroBefore = kp.privateKey.every(b => b === 0)
    expect(allZeroBefore).toBe(false)

    signer.dispose()

    expect(kp.privateKey.every(b => b === 0)).toBe(true)
  })
})
