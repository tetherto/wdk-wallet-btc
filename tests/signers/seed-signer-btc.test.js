import { describe, expect, test } from '@jest/globals'

import * as bip39 from 'bip39'
import { Psbt, networks, payments, Transaction, address as btcAddress } from 'bitcoinjs-lib'

import { ValueError } from '@tetherto/wdk-wallet'

import SeedSignerBtc from '../../src/signers/seed-signer-btc.js'

const VALID_SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'

const MESSAGE = 'Dummy message to sign.'

// Default account ("m/84'/1'/0'/0/0") for VALID_SEED_PHRASE with the default configuration.
const DEFAULT_PATH = "m/84'/1'/0'/0/0"
const DEFAULT_ADDRESS = 'bc1q8dqnpagwt9rtl7k38nuaa2ahf690avzkn3hdmf'
const DEFAULT_PRIVATE_KEY = '007335c465cb8183b8a43d3f4eb7dbeb65f51e3a94c4a42369f3d2979ffa35fa'
const DEFAULT_PUBLIC_KEY = '02e928d54a04833586b14e9c910884f589aebdc713a055e655c2fa13306c1b4f7f'

// Other accounts of VALID_SEED_PHRASE with the default configuration.
const PATH_005_ADDRESS = 'bc1qzlqkg0jy73dek6pj99lu4qa87v0mqlmjq3czvj'
const CHILD_001_ADDRESS = 'bc1qkr67mkl07s5slnjzsesza3g75qhu4rx6zu3u24'
const PAST_LEAF_ADDRESS = 'bc1qzfcza368u8nfmcfj9358ds4jws3qt0z9tw0mq3'
const CUSTOM_ROOT_ADDRESS = 'bc1qplyls7xzppmc3md439nft763ynylx6yzpkuxcq'
const FROM_M_ADDRESS = 'bc1q908a7wncgavppdhkjl0qncx2889dal3t8km3xe'

// The default account of VALID_SEED_PHRASE with a legacy (P2PKH) configuration.
const LEGACY_PATH = "m/44'/1'/0'/0/0"
const LEGACY_ADDRESS = '15MYf3n6zFiF4qJ5xAEbfstZFAniHN92Rx'

// Fixtures of VALID_SEED_PHRASE with a regtest configuration.
const REGTEST_CONFIG = { network: 'regtest' }
const REGTEST_ADDRESS = 'bcrt1q8dqnpagwt9rtl7k38nuaa2ahf690avzkm74nhn'
const REGTEST_XPUB = 'tpubDFzkKtmo97eBEPmF6sPJ4nzJPMYPDHuJPhARSReXWt7XBL6dQ61WTXTB8AtKDznckydrPAWtJRqHwxyvEZXudXxRJrphpU3ahFyiBR88QkQ'
const REGTEST_CHILD_001_XPUB = 'tpubDFzkKtmo97eBGKELLKV8WtugMAEfx7hGyc5ZWWngQZGPVaTv8acKJ64rfFUeLiaCGkA77J3XJ6XSJ4GVKWCydKRTkkNSYG9zB4X1eAuNtuz'
const REGTEST_EXPECTED_SIGNATURE = 'KAVgsxrQT5V4Mhfnk6taeCN1/j8p/sa8S9iNsbsgRb8zbfNOOPXV1w3dQQV0IjboJrlxYuDJnHw5a/E6vRJ+0Ek='

const EXPECTED_PSBT_PARTIAL_SIG_PUBKEY = '02e928d54a04833586b14e9c910884f589aebdc713a055e655c2fa13306c1b4f7f'
const EXPECTED_PSBT_PARTIAL_SIG_SIGNATURE = '3045022100bb13449bdd3b7c10817339e6dd22c276a205c744b5315fc8df94d2ddf1897681022011f945492c4b9607426124f0f0129dd2fb50344990ad93b134e1a06f9307191c01'

// Expected partial signatures when the same key signs one P2WPKH and one P2PKH input.
const EXPECTED_CROSS_TYPE_SEGWIT_SIGNATURE = '3044022028cdb2c1a9565c0cd6b022a2e52e09c4410fc2f76e98d274ecd760b1a5e7c7d202206122722575dbc85aad8fac9a6bb1aaefac2aff7c0d450ef66b3d6c523352b47701'
const EXPECTED_CROSS_TYPE_LEGACY_SIGNATURE = '3044022047880eabaf5d714ec4412e468317828a58f68f0a2b03b8bda198cf79cbe20c5c022013d46033bc1064923e607671f588e795ccd353e4fc38a87657a993ff2d3f477001'

const INVALID_PATH_MESSAGE = "Invalid format: Expected /^(m\\/)?(\\d+'?\\/)*\\d+'?$/ but received \"a'/b/c\""

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

describe('SeedSignerBtc', () => {
  describe('constructor', () => {
    test('should create a derivable signer at the default account', async () => {
      const signer = new SeedSignerBtc(VALID_SEED_PHRASE)

      expect(signer.isDerivable).toBe(true)
      expect(signer.path).toBe(DEFAULT_PATH)
      expect(await signer.getAddress()).toBe(DEFAULT_ADDRESS)
      expect(signer.network).toBe('bitcoin')
      expect(signer.type).toBe('segwit')

      signer.dispose()
    })

    test('should create a signer from raw seed bytes', async () => {
      const seedBytes = bip39.mnemonicToSeedSync(VALID_SEED_PHRASE)

      const signer = new SeedSignerBtc(seedBytes)

      expect(signer.path).toBe(DEFAULT_PATH)
      expect(await signer.getAddress()).toBe(DEFAULT_ADDRESS)

      signer.dispose()
    })

    test('should create a signer at an explicit path', async () => {
      const signer = new SeedSignerBtc(VALID_SEED_PHRASE, "m/84'/1'/0'/0/5")

      expect(signer.path).toBe("m/84'/1'/0'/0/5")
      expect(await signer.getAddress()).toBe(PATH_005_ADDRESS)

      signer.dispose()
    })

    test('should create a legacy signer with a P2PKH address', async () => {
      const signer = new SeedSignerBtc(VALID_SEED_PHRASE, undefined, { type: 'legacy' })

      expect(signer.path).toBe(LEGACY_PATH)
      expect(await signer.getAddress()).toBe(LEGACY_ADDRESS)
      expect(signer.type).toBe('legacy')

      signer.dispose()
    })

    test('should create a derivable signer at an intermediate path', () => {
      const signer = new SeedSignerBtc(VALID_SEED_PHRASE, "m/84'/1'")

      expect(signer.isDerivable).toBe(true)
      expect(signer.path).toBe("m/84'/1'")

      signer.dispose()
    })

    test('should not enforce any path shape', () => {
      const signer = new SeedSignerBtc(VALID_SEED_PHRASE, "m/9'/1")

      expect(signer.path).toBe("m/9'/1")

      signer.dispose()
    })

    test('should throw if the seed phrase is invalid', () => {
      expect(() => new SeedSignerBtc('invalid seed phrase'))
        .toThrow(ValueError)
      expect(() => new SeedSignerBtc('invalid seed phrase'))
        .toThrow('The seed phrase is invalid.')
    })

    test('should throw if the path is invalid', () => {
      expect(() => new SeedSignerBtc(VALID_SEED_PHRASE, "a'/b/c"))
        .toThrow(INVALID_PATH_MESSAGE)
    })

    test('should throw for unsupported type specifications', () => {
      expect(() => new SeedSignerBtc(VALID_SEED_PHRASE, undefined, { type: 'taproot' }))
        .toThrow(ValueError)
      expect(() => new SeedSignerBtc(VALID_SEED_PHRASE, undefined, { type: 'taproot' }))
        .toThrow('Invalid type specification. Supported types: legacy, segwit.')
    })
  })

  describe('keyPair', () => {
    test('should expose the expected key pair bytes', () => {
      const signer = new SeedSignerBtc(VALID_SEED_PHRASE)

      expect(Buffer.from(signer.keyPair.privateKey).toString('hex')).toBe(DEFAULT_PRIVATE_KEY)
      expect(Buffer.from(signer.keyPair.publicKey).toString('hex')).toBe(DEFAULT_PUBLIC_KEY)

      signer.dispose()
    })
  })

  describe('derive', () => {
    test('should derive a child signer relative to the signer path', async () => {
      const root = new SeedSignerBtc(VALID_SEED_PHRASE, "m/84'/1'")

      const child = await root.derive("0'/0/0")

      expect(child.isDerivable).toBe(true)
      expect(child.path).toBe(DEFAULT_PATH)
      expect(await child.getAddress()).toBe(DEFAULT_ADDRESS)
      expect(Buffer.from(child.keyPair.privateKey).toString('hex')).toBe(DEFAULT_PRIVATE_KEY)
      expect(Buffer.from(child.keyPair.publicKey).toString('hex')).toBe(DEFAULT_PUBLIC_KEY)

      child.dispose()
      root.dispose()
    })

    test('should derive distinct sibling accounts', async () => {
      const root = new SeedSignerBtc(VALID_SEED_PHRASE, "m/84'/1'")

      const child = await root.derive("0'/0/1")

      expect(child.path).toBe("m/84'/1'/0'/0/1")
      expect(await child.getAddress()).toBe(CHILD_001_ADDRESS)

      child.dispose()
      root.dispose()
    })

    test('should derive past a leaf account', async () => {
      const leaf = new SeedSignerBtc(VALID_SEED_PHRASE)

      const child = await leaf.derive('0')

      expect(child.path).toBe("m/84'/1'/0'/0/0/0")
      expect(await child.getAddress()).toBe(PAST_LEAF_ADDRESS)

      child.dispose()
      leaf.dispose()
    })

    test('should derive from a custom (non-standard) root', async () => {
      const root = new SeedSignerBtc(VALID_SEED_PHRASE, "m/9'/1")

      const child = await root.derive('0/0')

      expect(child.path).toBe("m/9'/1/0/0")
      expect(await child.getAddress()).toBe(CUSTOM_ROOT_ADDRESS)

      child.dispose()
      root.dispose()
    })

    test('should derive under any purpose from a signer at the master path', async () => {
      const root = new SeedSignerBtc(VALID_SEED_PHRASE, 'm')

      const child = await root.derive("44'/0'/0'/0/0")

      expect(child.path).toBe("m/44'/0'/0'/0/0")
      expect(await child.getAddress()).toBe(FROM_M_ADDRESS)

      child.dispose()
      root.dispose()
    })

    test('should propagate the configuration to derived children', async () => {
      const root = new SeedSignerBtc(VALID_SEED_PHRASE, "m/84'/1'", REGTEST_CONFIG)

      const child = await root.derive("0'/0/0")

      expect(child.network).toBe('regtest')
      expect(child.type).toBe('segwit')
      expect(await child.getAddress()).toBe(REGTEST_ADDRESS)

      child.dispose()
      root.dispose()
    })

    test('should keep a grandchild working after disposing the intermediate signer', async () => {
      const root = new SeedSignerBtc(VALID_SEED_PHRASE, "m/84'/1'")
      const intermediate = await root.derive("0'")

      const grandchild = await intermediate.derive('0/0')
      intermediate.dispose()

      expect(await grandchild.getAddress()).toBe(DEFAULT_ADDRESS)
      expect(Buffer.from(grandchild.keyPair.privateKey).toString('hex')).toBe(DEFAULT_PRIVATE_KEY)

      grandchild.dispose()
      root.dispose()
    })

    test('should throw if the relative path is invalid', async () => {
      const signer = new SeedSignerBtc(VALID_SEED_PHRASE)

      await expect(signer.derive("a'/b/c")).rejects.toThrow(INVALID_PATH_MESSAGE)

      signer.dispose()
    })
  })

  describe('getAddress', () => {
    test('should return the address', async () => {
      const signer = new SeedSignerBtc(VALID_SEED_PHRASE)

      const address = await signer.getAddress()

      expect(address).toBe(DEFAULT_ADDRESS)

      signer.dispose()
    })
  })

  describe('getExtendedPublicKey', () => {
    test('should return the account tpub on regtest', async () => {
      const signer = new SeedSignerBtc(VALID_SEED_PHRASE, undefined, REGTEST_CONFIG)

      const xpub = await signer.getExtendedPublicKey()

      expect(xpub).toBe(REGTEST_XPUB)

      signer.dispose()
    })

    test('should reflect the derived child account', async () => {
      const root = new SeedSignerBtc(VALID_SEED_PHRASE, "m/84'/1'", REGTEST_CONFIG)
      const child = await root.derive("0'/0/1")

      const xpub = await child.getExtendedPublicKey()

      expect(xpub).toBe(REGTEST_CHILD_001_XPUB)

      child.dispose()
      root.dispose()
    })
  })

  describe('sign', () => {
    test('should return the correct signature', async () => {
      const signer = new SeedSignerBtc(VALID_SEED_PHRASE, undefined, REGTEST_CONFIG)

      const signature = await signer.sign(MESSAGE)

      expect(signature).toBe(REGTEST_EXPECTED_SIGNATURE)

      signer.dispose()
    })
  })

  describe('signPsbt', () => {
    test('should sign owned inputs and leave foreign inputs untouched', async () => {
      const signer = new SeedSignerBtc(VALID_SEED_PHRASE, undefined, REGTEST_CONFIG)
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
      const signer = new SeedSignerBtc(VALID_SEED_PHRASE, undefined, REGTEST_CONFIG)
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
      const signer = new SeedSignerBtc(VALID_SEED_PHRASE, undefined, REGTEST_CONFIG)
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
    test('should clear secrets on dispose', async () => {
      const signer = new SeedSignerBtc(VALID_SEED_PHRASE)

      signer.dispose()

      expect(signer.keyPair.privateKey).toBeNull()
      expect(Buffer.from(signer.keyPair.publicKey).toString('hex')).toBe(DEFAULT_PUBLIC_KEY)
      expect(signer.path).toBe(DEFAULT_PATH)
      expect(await signer.getAddress()).toBe(DEFAULT_ADDRESS)
    })

    test('should be safe to call dispose more than once', () => {
      const signer = new SeedSignerBtc(VALID_SEED_PHRASE)

      signer.dispose()

      expect(() => signer.dispose()).not.toThrow()
    })

    test('should not affect the parent when disposing a child', async () => {
      const root = new SeedSignerBtc(VALID_SEED_PHRASE, "m/84'/1'")
      const child = await root.derive("0'/0/0")

      child.dispose()

      const sibling = await root.derive("0'/0/1")
      expect(await sibling.getAddress()).toBe(CHILD_001_ADDRESS)

      sibling.dispose()
      root.dispose()
    })

    test('should not affect derived children when disposing the parent', async () => {
      const root = new SeedSignerBtc(VALID_SEED_PHRASE, "m/84'/1'")
      const child = await root.derive("0'/0/0")

      root.dispose()

      expect(await child.getAddress()).toBe(DEFAULT_ADDRESS)
      expect(Buffer.from(child.keyPair.privateKey).toString('hex')).toBe(DEFAULT_PRIVATE_KEY)

      child.dispose()
    })
  })
})
