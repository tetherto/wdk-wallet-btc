import { describe, expect, test } from '@jest/globals'

import { Psbt, networks, payments, Transaction, address as btcAddress } from 'bitcoinjs-lib'

import { UnsupportedOperationError, ValueError } from '@tetherto/wdk-wallet'

import PrivateKeySignerBtc from '../../src/signers/private-key-signer-btc.js'

const VALID_PRIVATE_KEY = '15e083525dac99a2a9bba8f14a6eed9704a77c5994b1a9b4d7271ebd353b7966'
const EXPECTED_PUBLIC_KEY = '02f8044c82d6b9dfcfc3e6f3424cb11cc747bb34766bcbef72d2f52f6c4e8e07aa'

const MESSAGE = 'Dummy message to sign.'

// Fixtures for VALID_PRIVATE_KEY with a legacy regtest (P2PKH) configuration.
const LEGACY_REGTEST_CONFIG = { type: 'legacy', network: 'regtest' }
const LEGACY_REGTEST_ADDRESS = 'mjsVx6s5oH9VqwmhfjCyVo6t7APRGY6T8o'
const LEGACY_REGTEST_EXPECTED_SIGNATURE = 'H4RwJWJzRmVkgQDqmTgX0qCbSONLQjvjfXH7ZdKZs5S3BWbpfjqbGdIJQXy/+ppW4Lvaw0wZ/UaDOLhMw5TIDuk='

// Fixtures for VALID_PRIVATE_KEY with the default (segwit mainnet) configuration.
const DEFAULT_ADDRESS = 'bc1q9lpn7ks92lekmr6m0gpy4qyzyq8g98nufpddma'

// Fixtures for VALID_PRIVATE_KEY with a segwit regtest (P2WPKH) configuration.
const SEGWIT_REGTEST_CONFIG = { type: 'segwit', network: 'regtest' }
const EXPECTED_PSBT_PARTIAL_SIG_PUBKEY = '02f8044c82d6b9dfcfc3e6f3424cb11cc747bb34766bcbef72d2f52f6c4e8e07aa'
const EXPECTED_PSBT_PARTIAL_SIG_SIGNATURE = '3045022100baf90a97ad07d0cd320ad9c4e7028eb52f9f02b4b87bbb399c4883b324e78ff202204ed486957a17a03bc5cf96a13acdf6b05cc7ac18bc1a61d5d29806cd0f8cb78401'

// Expected partial signatures when the same key signs one P2WPKH and one P2PKH input.
const EXPECTED_CROSS_TYPE_SEGWIT_SIGNATURE = '304402200f18b8543658c55e3fc010a79610d45edfda734b1f9eff0182f836963af99e2b02202dc460ce00e6a68352c9706f51084d7bdee38b775a0778ad810d7cf0b68c18a101'
const EXPECTED_CROSS_TYPE_LEGACY_SIGNATURE = '30440220051d65c4bc8960d761a689f3d072f367309bd34b942d56f24bd6f7fa3f25ca8f022073bb1905cf758ba3e1efefc991cacf69873c0941f913d212dc26bfdc90a7307401'

// Foreign (not-ours) regtest address used to add an unrelated PSBT input/output.
const PSBT_FOREIGN_ADDRESS = 'bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080'

/**
 * Builds an in-memory PSBT with two SegWit inputs: input 0 is owned by `signer`, input 1 belongs
 * to an unrelated script. Lets us exercise signPsbt fully offline (no UTXO fetch / regtest harness).
 */
function buildMixedPsbt (address) {
  const network = networks.regtest
  const myScript = btcAddress.toOutputScript(address, network)
  const foreignScript = btcAddress.toOutputScript(PSBT_FOREIGN_ADDRESS, network)
  const psbt = new Psbt({ network })
  psbt.addInput({ hash: '11'.repeat(32), index: 0, witnessUtxo: { script: myScript, value: BigInt(100000) } })
  psbt.addInput({ hash: '22'.repeat(32), index: 1, witnessUtxo: { script: foreignScript, value: BigInt(50000) } })
  psbt.addOutput({ address: PSBT_FOREIGN_ADDRESS, value: BigInt(90000) })
  return psbt
}

/**
 * Builds an in-memory PSBT with two inputs controlled by the same public key under different
 * script types: input 0 is P2WPKH (witnessUtxo), input 1 is P2PKH (full nonWitnessUtxo whose
 * hash matches the outpoint).
 */
function buildCrossTypePsbt (publicKey) {
  const network = networks.regtest
  const p2wpkhScript = payments.p2wpkh({ pubkey: publicKey, network }).output
  const p2pkhScript = payments.p2pkh({ pubkey: publicKey, network }).output

  const prevTx = new Transaction()
  prevTx.addInput(Buffer.alloc(32), 0)
  prevTx.addOutput(p2pkhScript, BigInt(60000))

  const psbt = new Psbt({ network })
  psbt.addInput({ hash: '11'.repeat(32), index: 0, witnessUtxo: { script: p2wpkhScript, value: BigInt(100000) } })
  psbt.addInput({ hash: prevTx.getHash(), index: 0, nonWitnessUtxo: prevTx.toBuffer() })
  psbt.addOutput({ address: PSBT_FOREIGN_ADDRESS, value: BigInt(150000) })
  return psbt
}

describe('PrivateKeySignerBtc', () => {
  describe('constructor', () => {
    test('should create a signer from a hex string', async () => {
      const signer = new PrivateKeySignerBtc(VALID_PRIVATE_KEY, LEGACY_REGTEST_CONFIG)

      expect(signer.isDerivable).toBe(false)
      expect(signer.path).toBeNull()
      expect(await signer.getAddress()).toBe(LEGACY_REGTEST_ADDRESS)
      expect(signer.network).toBe('regtest')
      expect(signer.type).toBe('legacy')

      signer.dispose()
    })

    test('should create a signer from a Buffer', async () => {
      const keyBytes = Buffer.from(VALID_PRIVATE_KEY, 'hex')

      const signer = new PrivateKeySignerBtc(keyBytes, LEGACY_REGTEST_CONFIG)

      expect(await signer.getAddress()).toBe(LEGACY_REGTEST_ADDRESS)

      signer.dispose()
    })

    test('should create a signer from a Uint8Array', async () => {
      const keyBytes = new Uint8Array(Buffer.from(VALID_PRIVATE_KEY, 'hex'))

      const signer = new PrivateKeySignerBtc(keyBytes, LEGACY_REGTEST_CONFIG)

      expect(await signer.getAddress()).toBe(LEGACY_REGTEST_ADDRESS)

      signer.dispose()
    })

    test('should own an independent copy of the private key', () => {
      const keyBytes = new Uint8Array(Buffer.from(VALID_PRIVATE_KEY, 'hex'))
      const signer = new PrivateKeySignerBtc(keyBytes)

      keyBytes.fill(0)

      expect(Buffer.from(signer.keyPair.privateKey).toString('hex')).toBe(VALID_PRIVATE_KEY)

      signer.dispose()
    })

    test('should default to a segwit mainnet configuration', async () => {
      const signer = new PrivateKeySignerBtc(VALID_PRIVATE_KEY)

      expect(await signer.getAddress()).toBe(DEFAULT_ADDRESS)
      expect(signer.network).toBe('bitcoin')
      expect(signer.type).toBe('segwit')

      signer.dispose()
    })

    test('should throw if the private key is too short', () => {
      expect(() => new PrivateKeySignerBtc('aabb'))
        .toThrow(ValueError)
      expect(() => new PrivateKeySignerBtc('aabb'))
        .toThrow('The private key must be 32 bytes.')
    })

    test('should throw if the private key is too long', () => {
      expect(() => new PrivateKeySignerBtc('ff'.repeat(33)))
        .toThrow(ValueError)
      expect(() => new PrivateKeySignerBtc('ff'.repeat(33)))
        .toThrow('The private key must be 32 bytes.')
    })
  })

  describe('keyPair', () => {
    test('should expose the expected key pair bytes', () => {
      const signer = new PrivateKeySignerBtc(VALID_PRIVATE_KEY)

      expect(Buffer.from(signer.keyPair.privateKey).toString('hex')).toBe(VALID_PRIVATE_KEY)
      expect(Buffer.from(signer.keyPair.publicKey).toString('hex')).toBe(EXPECTED_PUBLIC_KEY)

      signer.dispose()
    })
  })

  describe('derive', () => {
    test('should throw when calling derive', async () => {
      const signer = new PrivateKeySignerBtc(VALID_PRIVATE_KEY)

      const promise = signer.derive("0'/0/0")

      await expect(promise).rejects.toThrow(UnsupportedOperationError)
      await expect(promise).rejects.toThrow("Method 'derive(path)' is not supported.")

      signer.dispose()
    })
  })

  describe('getAddress', () => {
    test('should return the address', async () => {
      const signer = new PrivateKeySignerBtc(VALID_PRIVATE_KEY, LEGACY_REGTEST_CONFIG)

      const address = await signer.getAddress()

      expect(address).toBe(LEGACY_REGTEST_ADDRESS)

      signer.dispose()
    })
  })

  describe('getExtendedPublicKey', () => {
    test('should throw when requesting an extended public key', async () => {
      const signer = new PrivateKeySignerBtc(VALID_PRIVATE_KEY)

      const promise = signer.getExtendedPublicKey()

      await expect(promise).rejects.toThrow(UnsupportedOperationError)
      await expect(promise).rejects.toThrow("Method 'getExtendedPublicKey()' is not supported.")

      signer.dispose()
    })
  })

  describe('sign', () => {
    test('should return the correct signature', async () => {
      const signer = new PrivateKeySignerBtc(VALID_PRIVATE_KEY, LEGACY_REGTEST_CONFIG)

      const signature = await signer.sign(MESSAGE)

      expect(signature).toBe(LEGACY_REGTEST_EXPECTED_SIGNATURE)

      signer.dispose()
    })
  })

  describe('signPsbt', () => {
    test('should sign owned inputs and leave foreign inputs untouched', async () => {
      const signer = new PrivateKeySignerBtc(VALID_PRIVATE_KEY, SEGWIT_REGTEST_CONFIG)
      const psbt = buildMixedPsbt(await signer.getAddress())

      const signed = await signer.signPsbt(psbt)

      const parsed = Psbt.fromBase64(signed)
      expect(parsed.data.inputs[0].partialSig).toHaveLength(1)
      expect(Buffer.from(parsed.data.inputs[0].partialSig[0].pubkey).toString('hex'))
        .toBe(EXPECTED_PSBT_PARTIAL_SIG_PUBKEY)
      expect(Buffer.from(parsed.data.inputs[0].partialSig[0].signature).toString('hex'))
        .toBe(EXPECTED_PSBT_PARTIAL_SIG_SIGNATURE)
      expect(parsed.data.inputs[1].partialSig).toBeUndefined()

      signer.dispose()
    })

    test('should sign every input the key controls regardless of script type', async () => {
      const signer = new PrivateKeySignerBtc(VALID_PRIVATE_KEY, SEGWIT_REGTEST_CONFIG)
      const psbt = buildCrossTypePsbt(signer.keyPair.publicKey)

      const signed = await signer.signPsbt(psbt)

      const parsed = Psbt.fromBase64(signed)
      expect(Buffer.from(parsed.data.inputs[0].partialSig[0].signature).toString('hex'))
        .toBe(EXPECTED_CROSS_TYPE_SEGWIT_SIGNATURE)
      expect(Buffer.from(parsed.data.inputs[1].partialSig[0].signature).toString('hex'))
        .toBe(EXPECTED_CROSS_TYPE_LEGACY_SIGNATURE)

      signer.dispose()
    })

    test('should throw if the key controls none of the inputs', async () => {
      const signer = new PrivateKeySignerBtc(VALID_PRIVATE_KEY, SEGWIT_REGTEST_CONFIG)
      const network = networks.regtest
      const foreignScript = btcAddress.toOutputScript(PSBT_FOREIGN_ADDRESS, network)
      const psbt = new Psbt({ network })
      psbt.addInput({ hash: '33'.repeat(32), index: 0, witnessUtxo: { script: foreignScript, value: BigInt(50000) } })
      psbt.addOutput({ address: PSBT_FOREIGN_ADDRESS, value: BigInt(40000) })

      await expect(signer.signPsbt(psbt)).rejects.toThrow('No inputs were signed')

      signer.dispose()
    })
  })

  describe('dispose', () => {
    test('should clear secrets on dispose', () => {
      const signer = new PrivateKeySignerBtc(VALID_PRIVATE_KEY)

      signer.dispose()

      expect(signer.keyPair.privateKey).toBeNull()
      expect(Buffer.from(signer.keyPair.publicKey).toString('hex')).toBe(EXPECTED_PUBLIC_KEY)
    })

    test('should be safe to call dispose more than once', () => {
      const signer = new PrivateKeySignerBtc(VALID_PRIVATE_KEY)

      signer.dispose()

      expect(() => signer.dispose()).not.toThrow()
    })

    test('should not wipe the caller-supplied key bytes on dispose', () => {
      const keyBytes = new Uint8Array(Buffer.from(VALID_PRIVATE_KEY, 'hex'))
      const signer = new PrivateKeySignerBtc(keyBytes)

      signer.dispose()

      expect(Buffer.from(keyBytes).toString('hex')).toBe(VALID_PRIVATE_KEY)
    })
  })
})
