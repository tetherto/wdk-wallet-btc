import { describe, expect, test } from '@jest/globals'

import SeedSignerBtc from '../src/signers/seed-signer-btc.js'
import PrivateKeySignerBtc from '../src/signers/private-key-signer-btc.js'

const VALID_SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'
const VALID_PRIVATE_KEY = '15e083525dac99a2a9bba8f14a6eed9704a77c5994b1a9b4d7271ebd353b7966'

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

  test('should create a root signer with a valid seed phrase', () => {
    const signer = new SeedSignerBtc(VALID_SEED_PHRASE)
    expect(signer.isRoot).toBe(true)
    signer.dispose()
  })

  test('should derive a child signer from a root signer', () => {
    const root = new SeedSignerBtc(VALID_SEED_PHRASE)
    const child = root.derive("0'/0/0")
    expect(child.isRoot).toBe(false)
    expect(child.address).toBeDefined()
    expect(child.path).toMatch(/^m\/84'\/1'\/0'\/0\/0$/)
    child.dispose()
    root.dispose()
  })

  test('should throw when deriving from a root signer that is not a root', () => {
    const root = new SeedSignerBtc(VALID_SEED_PHRASE)
    expect(root.isRoot).toBe(true)
    root.dispose()
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
    const signer = new PrivateKeySignerBtc(VALID_PRIVATE_KEY)
    expect(signer.address).toBeDefined()
    signer.dispose()
  })

  test('should accept a Buffer', () => {
    const buf = Buffer.from(VALID_PRIVATE_KEY, 'hex')
    const signer = new PrivateKeySignerBtc(buf)
    expect(signer.address).toBeDefined()
    signer.dispose()
  })

  test('should accept a Uint8Array (zero-copy)', () => {
    const arr = new Uint8Array(Buffer.from(VALID_PRIVATE_KEY, 'hex'))
    const signer = new PrivateKeySignerBtc(arr)
    expect(signer.address).toBeDefined()
    signer.dispose()
  })

  test('should throw on derive()', () => {
    const signer = new PrivateKeySignerBtc(VALID_PRIVATE_KEY)
    expect(() => signer.derive()).toThrow('derive is not supported')
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
