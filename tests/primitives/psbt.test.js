import { describe, expect, test } from '@jest/globals'

import { address as btcAddress, networks, payments, Transaction } from 'bitcoinjs-lib'
import { vsize } from '@bitcoinerlab/coinselect'
import { fromHex } from 'uint8array-tools'

import { AssertionError, TransactionError, TransactionErrorReason, ValueError } from '@tetherto/wdk-wallet'

import { Output } from '../../src/crypto-engine.js'
import { getAddressDescriptor } from '../../src/primitives/descriptor.js'
import { MAX_STANDARD_TX_VSIZE, getDustLimit } from '../../src/primitives/dust.js'
import { buildPsbt, getSignedTransactionFee, planSpend, planSweep } from '../../src/primitives/psbt.js'

import { sweepFee } from '../helpers/utils.js'

const network = networks.regtest

function hashOf (seed, length) {
  return Buffer.alloc(length, seed)
}

function p2tr (seed) {
  for (let attempt = 0; ; attempt++) {
    try {
      return payments.p2tr({ pubkey: Buffer.concat([hashOf(seed, 31), Buffer.from([attempt])]), network }).address
    } catch {}
  }
}

const ADDRESSES = {
  p2pkh: payments.p2pkh({ hash: hashOf(1, 20), network }).address,
  p2sh: payments.p2sh({ hash: hashOf(2, 20), network }).address,
  p2wpkh: payments.p2wpkh({ hash: hashOf(3, 20), network }).address,
  p2wpkhOther: payments.p2wpkh({ hash: hashOf(4, 20), network }).address,
  p2wsh: payments.p2wsh({ hash: hashOf(5, 32), network }).address,
  p2tr: p2tr(6)
}

const FROM = ADDRESSES.p2wpkh
const TO = ADDRESSES.p2wpkhOther

function utxo (value, index = 0) {
  return {
    outpoint: { txid: index.toString(16).padStart(64, '0'), vout: index % 3 },
    value: BigInt(value),
    height: 100
  }
}

const DEFAULTS = {
  fromAddress: FROM,
  targets: [{ address: TO, value: 50_000n }],
  feeRate: 1,
  network,
  chainUtxos: [utxo(100_000)]
}

describe('planSpend', () => {
  describe('selection and outputs', () => {
    test('should keep the targets\' order in the returned outputs', () => {
      const targets = [
        { address: TO, value: 20_000n },
        { address: ADDRESSES.p2wsh, value: 30_000n }
      ]

      const { outputs } = planSpend({ ...DEFAULTS, targets })

      expect(outputs.slice(0, 2)).toEqual(targets)
    })

    test('should flag the change output with isChange when the change clears the sender\'s dust limit', () => {
      const { outputs, fee } = planSpend({ ...DEFAULTS })

      const change = outputs.find(output => output.isChange)

      expect(outputs).toHaveLength(2)
      expect(change).toEqual({ address: FROM, value: 49_859n, isChange: true })
      expect(fee).toBe(141n)
    })

    test('should return a single output and fold the leftover into the fee when the inputs fit the amount exactly', () => {
      const { inputs, outputs, fee } = planSpend({ ...DEFAULTS, chainUtxos: [utxo(50_200)] })

      expect(inputs).toHaveLength(1)
      expect(outputs).toEqual([{ address: TO, value: 50_000n }])
      expect(fee).toBe(200n)
    })

    test('should return only the selected UTXOs as inputs, with their script, address and script type', () => {
      const chainUtxos = [utxo(1_000, 0), utxo(100_000, 1), utxo(2_000, 2)]

      const { inputs } = planSpend({ ...DEFAULTS, chainUtxos })

      expect(inputs).toHaveLength(1)
      expect(inputs[0]).toEqual({
        ...chainUtxos[1],
        script: btcAddress.toOutputScript(FROM, network),
        address: FROM,
        scriptType: 'segwit'
      })
    })

    test('should keep the target and change outputs distinct when sending to the sender\'s own address', () => {
      const { outputs } = planSpend({ ...DEFAULTS, targets: [{ address: FROM, value: 50_000n }] })

      expect(outputs).toEqual([
        { address: FROM, value: 50_000n },
        { address: FROM, value: 49_859n, isChange: true }
      ])
    })
  })

  describe('change versus dust', () => {
    test('should keep change equal to the sender\'s dust limit', () => {
      const { outputs, fee } = planSpend({ ...DEFAULTS, chainUtxos: [utxo(50_000 + 141 + 297)] })

      expect(outputs).toEqual([
        { address: TO, value: 50_000n },
        { address: FROM, value: 297n, isChange: true }
      ])
      expect(fee).toBe(141n)
    })

    test('should fold change one satoshi below the sender\'s dust limit into the fee', () => {
      const { outputs, fee } = planSpend({ ...DEFAULTS, chainUtxos: [utxo(50_000 + 141 + 296)] })

      expect(outputs).toEqual([{ address: TO, value: 50_000n }])
      expect(fee).toBe(437n)
    })

    test('should fold change between the lib\'s and Core\'s dust limit into the fee for a P2TR sender', () => {
      const { outputs, fee } = planSpend({ ...DEFAULTS, fromAddress: ADDRESSES.p2tr, chainUtxos: [utxo(50_445)] })

      expect(outputs).toEqual([{ address: TO, value: 50_000n }])
      expect(fee).toBe(445n)
    })

    test('should compute the vsize without the change output when the change is folded into the fee', () => {
      const fromAddress = ADDRESSES.p2tr

      const { inputs, vsize: planVsize } = planSpend({ ...DEFAULTS, fromAddress, chainUtxos: [utxo(50_445)] })

      const from = new Output({ descriptor: getAddressDescriptor(fromAddress), network })
      const to = new Output({ descriptor: getAddressDescriptor(TO), network })
      const inputOutputs = inputs.map(() => from)

      expect(planVsize).toBe(vsize(inputOutputs, [to]))
      expect(planVsize).toBeLessThan(vsize(inputOutputs, [to, from]))
    })
  })

  describe('fee', () => {
    test('should plan a spend at the lowest fee rate the lib allows (0.1 sat/vB) and return that rate', () => {
      const { feeRate, fee } = planSpend({ ...DEFAULTS, feeRate: 0.1 })

      expect(feeRate).toBe(0.1)
      expect(fee).toBe(15n)
    })

    test('should throw if the fee rate is below 0.1 sat/vB', () => {
      expect(() => planSpend({ ...DEFAULTS, feeRate: 0.09 })).toThrow('Fee rate 0.09 not supported')
    })
  })

  describe('validation', () => {
    test('should throw if there are no targets', () => {
      const build = () => planSpend({ ...DEFAULTS, targets: [] })

      expect(build).toThrow(ValueError)
      expect(build).toThrow('At least one target is required.')
    })

    test('should throw if any target is below its dust limit', () => {
      const targets = [
        { address: TO, value: 50_000n },
        { address: ADDRESSES.p2wsh, value: 296n }
      ]

      const build = () => planSpend({ ...DEFAULTS, targets })

      expect(build).toThrow(ValueError)
      expect(build).toThrow('The amount must be at least the dust limit (= 333).')
    })

    describe.each([
      ['P2WPKH', ADDRESSES.p2wpkhOther, 297n],
      ['P2SH', ADDRESSES.p2sh, 540n],
      ['P2TR', ADDRESSES.p2tr, 333n]
    ])('with a %s recipient', (_, address, dustLimit) => {
      test('should throw at the recipient\'s dust limit minus one', () => {
        const build = () => planSpend({ ...DEFAULTS, targets: [{ address, value: dustLimit - 1n }] })

        expect(build).toThrow(ValueError)
        expect(build).toThrow(`The amount must be at least the dust limit (= ${dustLimit}).`)
      })

      test('should accept the recipient\'s dust limit', () => {
        const { outputs } = planSpend({ ...DEFAULTS, targets: [{ address, value: dustLimit }] })

        expect(outputs[0]).toEqual({ address, value: dustLimit })
      })
    })

    test('should throw if there are no unspent outputs', () => {
      const build = () => planSpend({ ...DEFAULTS, chainUtxos: [] })

      expect(build).toThrow(TransactionError)
      expect(build).toThrow('No unspent outputs available.')
      expect(build).toThrow(expect.objectContaining({ reason: TransactionErrorReason.INSUFFICIENT_BALANCE }))
    })

    test('should throw if the balance does not cover the amount', () => {
      const build = () => planSpend({ ...DEFAULTS, chainUtxos: [utxo(10_000)] })

      expect(build).toThrow(TransactionError)
      expect(build).toThrow('Insufficient funds to cover the amounts and the fee.')
      expect(build).toThrow(expect.objectContaining({ reason: TransactionErrorReason.INSUFFICIENT_BALANCE }))
    })

    test('should throw if the balance covers the amount but not the fee', () => {
      const build = () => planSpend({ ...DEFAULTS, chainUtxos: [utxo(50_100)] })

      expect(build).toThrow(TransactionError)
      expect(build).toThrow('Insufficient funds to cover the amounts and the fee.')
      expect(build).toThrow(expect.objectContaining({ reason: TransactionErrorReason.INSUFFICIENT_BALANCE }))
    })
  })

  describe('scale', () => {
    test('should not cap the number of inputs', () => {
      const chainUtxos = Array.from({ length: 400 }, (_, index) => utxo(500, index))

      const { inputs } = planSpend({ ...DEFAULTS, targets: [{ address: TO, value: 100_000n }], chainUtxos })

      expect(inputs.length).toBeGreaterThan(200)
    })
  })

  describe('script types', () => {
    test.each([
      ['P2PKH', ADDRESSES.p2pkh, 'legacy'],
      ['P2WPKH', ADDRESSES.p2wpkh, 'segwit']
    ])('should set the input script type for a %s sender', (_, fromAddress, scriptType) => {
      const { inputs } = planSpend({ ...DEFAULTS, fromAddress })

      expect(inputs.every(input => input.scriptType === scriptType)).toBe(true)
    })

    test.each(Object.entries(ADDRESSES))('should plan a spend to a %s recipient from a legacy sender', (_, address) => {
      const { outputs } = planSpend({ ...DEFAULTS, fromAddress: ADDRESSES.p2pkh, targets: [{ address, value: 50_000n }] })

      expect(outputs[0]).toEqual({ address, value: 50_000n })
    })

    test.each(Object.entries(ADDRESSES))('should plan a spend to a %s recipient from a segwit sender', (_, address) => {
      const { outputs } = planSpend({ ...DEFAULTS, fromAddress: ADDRESSES.p2wpkh, targets: [{ address, value: 50_000n }] })

      expect(outputs[0]).toEqual({ address, value: 50_000n })
    })
  })

  describe('purity', () => {
    test('should not mutate the targets or the unspent outputs it is given', () => {
      const targets = [{ address: TO, value: 50_000n }]
      const chainUtxos = [utxo(100_000)]
      const targetsBefore = structuredClone(targets)
      const chainUtxosBefore = structuredClone(chainUtxos)

      planSpend({ ...DEFAULTS, targets, chainUtxos })

      expect(targets).toEqual(targetsBefore)
      expect(chainUtxos).toEqual(chainUtxosBefore)
    })

    test('should return outputs that are not the caller\'s target objects', () => {
      const targets = [{ address: TO, value: 50_000n }]

      const { outputs } = planSpend({ ...DEFAULTS, targets })

      expect(outputs[0]).not.toBe(targets[0])
    })
  })
})

describe('planSweep', () => {
  const outputOf = (address) => new Output({ descriptor: getAddressDescriptor(address), network })

  const dustLimitOf = (address) => getDustLimit(btcAddress.toOutputScript(address, network))

  const sweep = (chainUtxos, { to = TO, feeRate = 1 } = {}) => planSweep({ fromAddress: FROM, toAddress: to, feeRate, network, chainUtxos })

  describe('selection and outputs', () => {
    test('should spend a single UTXO into one output without change', () => {
      const chainUtxos = [utxo(100_000)]
      const fee = sweepFee({ from: FROM, to: TO, network })

      const plan = sweep(chainUtxos)

      expect(plan.inputs).toEqual([{
        ...chainUtxos[0],
        script: btcAddress.toOutputScript(FROM, network),
        address: FROM,
        scriptType: 'segwit'
      }])
      expect(plan.outputs).toEqual([{ address: TO, value: 100_000n - fee }])
      expect(plan.fee).toBe(fee)
      expect(plan.feeRate).toBe(1)
      expect(plan.vsize).toBe(vsize([outputOf(FROM)], [outputOf(TO)]))
    })

    test('should spend all the UTXOs and sum their values into the output', () => {
      const chainUtxos = [utxo(30_000, 0), utxo(50_000, 1), utxo(20_000, 2)]
      const fee = sweepFee({ from: FROM, to: TO, network, inputCount: 3 })

      const plan = sweep(chainUtxos)

      expect(plan.inputs.map(input => input.value)).toEqual([30_000n, 50_000n, 20_000n])
      expect(plan.outputs).toEqual([{ address: TO, value: 100_000n - fee }])
      expect(plan.fee).toBe(fee)
    })

    test('should round the fee up for a decimal fee rate', () => {
      const feeRate = 1.01
      const fee = sweepFee({ from: FROM, to: TO, network, feeRate })

      const plan = sweep([utxo(100_000)], { feeRate })

      expect(plan.vsize * feeRate).not.toBe(Math.floor(plan.vsize * feeRate))
      expect(plan.fee).toBe(fee)
      expect(plan.fee).toBe(BigInt(Math.floor(plan.vsize * feeRate)) + 1n)
      expect(plan.feeRate).toBe(feeRate)
      expect(plan.outputs).toEqual([{ address: TO, value: 100_000n - fee }])
    })

    test('should sweep to the sender\'s own address', () => {
      const fee = sweepFee({ from: FROM, to: FROM, network })

      const plan = sweep([utxo(100_000)], { to: FROM })

      expect(plan.outputs).toEqual([{ address: FROM, value: 100_000n - fee }])
      expect(plan.fee).toBe(fee)
    })

    test('should pay a fee that depends on the recipient\'s address type', () => {
      const toP2pkh = sweep([utxo(100_000)], { to: ADDRESSES.p2pkh })
      const toP2tr = sweep([utxo(100_000)], { to: ADDRESSES.p2tr })

      expect(toP2pkh.fee).toBe(sweepFee({ from: FROM, to: ADDRESSES.p2pkh, network }))
      expect(toP2tr.fee).toBe(sweepFee({ from: FROM, to: ADDRESSES.p2tr, network }))
      expect(toP2pkh.fee).not.toBe(toP2tr.fee)
    })
  })

  describe('recipient dust limit', () => {
    test('should accept a balance equal to the fee plus the dust limit', () => {
      const fee = sweepFee({ from: FROM, to: TO, network })

      const plan = sweep([utxo(fee + dustLimitOf(TO))])

      expect(plan.outputs).toEqual([{ address: TO, value: dustLimitOf(TO) }])
    })

    test('should throw if the balance is one satoshi below the fee plus the dust limit', () => {
      const fee = sweepFee({ from: FROM, to: TO, network })

      const build = () => sweep([utxo(fee + dustLimitOf(TO) - 1n)])

      expect(build).toThrow(TransactionError)
      expect(build).toThrow('Insufficient funds to cover the amounts and the fee.')
      expect(build).toThrow(expect.objectContaining({ reason: TransactionErrorReason.INSUFFICIENT_BALANCE }))
    })

    describe.each(['p2pkh', 'p2sh', 'p2wpkh', 'p2wsh', 'p2tr'])('with a %s recipient', (kind) => {
      const to = ADDRESSES[kind]

      test('should accept exactly the recipient\'s dust limit', () => {
        const fee = sweepFee({ from: FROM, to, network })

        const plan = sweep([utxo(fee + dustLimitOf(to))], { to })

        expect(plan.outputs).toEqual([{ address: to, value: dustLimitOf(to) }])
      })

      test('should throw one satoshi below the recipient\'s dust limit', () => {
        const fee = sweepFee({ from: FROM, to, network })

        const build = () => sweep([utxo(fee + dustLimitOf(to) - 1n)], { to })

        expect(build).toThrow(TransactionError)
        expect(build).toThrow('Insufficient funds to cover the amounts and the fee.')
        expect(build).toThrow(expect.objectContaining({ reason: TransactionErrorReason.INSUFFICIENT_BALANCE }))
      })
    })
  })

  describe('insufficient funds', () => {
    test('should throw if there are no UTXOs', () => {
      const build = () => sweep([])

      expect(build).toThrow(TransactionError)
      expect(build).toThrow('No unspent outputs available.')
      expect(build).toThrow(expect.objectContaining({ reason: TransactionErrorReason.INSUFFICIENT_BALANCE }))
    })

    test('should throw if the balance is less than the fee', () => {
      const fee = sweepFee({ from: FROM, to: TO, network })

      const build = () => sweep([utxo(fee - 1n)])

      expect(build).toThrow(TransactionError)
      expect(build).toThrow('Insufficient funds to cover the amounts and the fee.')
      expect(build).toThrow(expect.objectContaining({ reason: TransactionErrorReason.INSUFFICIENT_BALANCE }))
    })

    test('should throw if every UTXO is worth less than the fee it adds', () => {
      const chainUtxos = Array.from({ length: 20 }, (_, index) => utxo(10, index))

      const build = () => sweep(chainUtxos, { feeRate: 100 })

      expect(build).toThrow(TransactionError)
      expect(build).toThrow('Insufficient funds to cover the amounts and the fee.')
      expect(build).toThrow(expect.objectContaining({ reason: TransactionErrorReason.INSUFFICIENT_BALANCE }))
    })

    test('should leave out UTXOs that cost more in fees than they hold', () => {
      const chainUtxos = [utxo(1_000_000, 0), utxo(10, 1), utxo(10, 2)]
      const fee = sweepFee({ from: FROM, to: TO, network, feeRate: 100 })

      const plan = sweep(chainUtxos, { feeRate: 100 })

      expect(plan.inputs.map(input => input.value)).toEqual([1_000_000n])
      expect(plan.fee).toBe(fee)
      expect(plan.outputs).toEqual([{ address: TO, value: 1_000_000n - fee }])
    })
  })

  describe('standard size', () => {
    test('should accept a sweep just under the maximum standard size', () => {
      const chainUtxos = Array.from({ length: 1469 }, (_, index) => utxo(1_000, index))

      const { vsize: planVsize } = planSweep({ fromAddress: FROM, toAddress: TO, feeRate: 1, network, chainUtxos })

      expect(planVsize).toBeLessThanOrEqual(MAX_STANDARD_TX_VSIZE)
    })

    test('should throw if the sweep exceeds the maximum standard size', () => {
      const chainUtxos = Array.from({ length: 1470 }, (_, index) => utxo(1_000, index))

      const build = () => planSweep({ fromAddress: FROM, toAddress: TO, feeRate: 1, network, chainUtxos })

      expect(build).toThrow(ValueError)
      expect(build).toThrow('The transaction exceeds the maximum standard size.')
    })
  })
})

describe('buildPsbt key origins', () => {
  const FROM_OTHER = payments.p2wpkh({ hash: hashOf(7, 20), network }).address

  function origin (path, seed) {
    return { masterFingerprint: '0a0b0c0d', path, pubkey: Buffer.concat([Buffer.from([2]), hashOf(seed, 32)]) }
  }

  const ORIGIN_FROM = origin("m/84'/1'/0'/0/0", 8)
  const ORIGIN_FROM_OTHER = origin("m/84'/1'/0'/0/1", 9)

  function segwitInput (address, index) {
    return {
      outpoint: { txid: index.toString(16).padStart(64, '0'), vout: 0 },
      value: 100_000n,
      height: 100,
      script: btcAddress.toOutputScript(address, network),
      address,
      scriptType: 'segwit'
    }
  }

  const PLAN = {
    inputs: [segwitInput(FROM, 1), segwitInput(FROM_OTHER, 2)],
    outputs: [
      { address: TO, value: 50_000n },
      { address: FROM, value: 149_000n, isChange: true }
    ],
    fee: 1_000n,
    feeRate: 1,
    vsize: 200
  }

  function build (keyOrigins) {
    return buildPsbt({ plan: PLAN, network, prevTxs: {}, keyOrigins })
  }

  test('should attach the key origin to each input by its address', () => {
    const { inputs } = build({ [FROM]: ORIGIN_FROM, [FROM_OTHER]: ORIGIN_FROM_OTHER }).data

    expect(inputs[0].bip32Derivation).toEqual([{ masterFingerprint: fromHex(ORIGIN_FROM.masterFingerprint), path: ORIGIN_FROM.path, pubkey: ORIGIN_FROM.pubkey }])
    expect(inputs[1].bip32Derivation).toEqual([{ masterFingerprint: fromHex(ORIGIN_FROM_OTHER.masterFingerprint), path: ORIGIN_FROM_OTHER.path, pubkey: ORIGIN_FROM_OTHER.pubkey }])
  })

  test('should attach the key origin to the change output', () => {
    const { outputs } = build({ [FROM]: ORIGIN_FROM }).data

    expect(outputs[1].bip32Derivation).toEqual([{ masterFingerprint: fromHex(ORIGIN_FROM.masterFingerprint), path: ORIGIN_FROM.path, pubkey: ORIGIN_FROM.pubkey }])
  })

  test('should not attach a key origin to a non-change output, even if its address is mapped', () => {
    const { outputs } = build({ [TO]: origin("m/84'/1'/0'/0/2", 10) }).data

    expect(outputs[0].bip32Derivation).toBeUndefined()
  })

  test('should not attach a key origin to an input or change output whose address is not mapped', () => {
    const { inputs, outputs } = build({ [FROM_OTHER]: ORIGIN_FROM_OTHER }).data

    expect(inputs[0].bip32Derivation).toBeUndefined()
    expect(inputs[1].bip32Derivation).toEqual([{ masterFingerprint: fromHex(ORIGIN_FROM_OTHER.masterFingerprint), path: ORIGIN_FROM_OTHER.path, pubkey: ORIGIN_FROM_OTHER.pubkey }])
    expect(outputs[1].bip32Derivation).toBeUndefined()
  })

  test('should not attach any key origin without key origins', () => {
    const { inputs, outputs } = build().data

    for (const entry of [...inputs, ...outputs]) {
      expect(entry.bip32Derivation).toBeUndefined()
    }
  })
})

describe('getSignedTransactionFee', () => {
  const spend = new Transaction()
  spend.addInput(Buffer.alloc(32, 1), 0)
  spend.addOutput(Buffer.from([0x6a]), 0n)

  const prevTxId = '01'.repeat(32)

  const rogueTx = new Transaction()
  rogueTx.addInput(Buffer.alloc(32), 0)
  rogueTx.addOutput(Buffer.from([0x6a]), 1_000n)

  test('should throw if a previous transaction\'s id doesn\'t match the input that spends it', () => {
    expect(() => getSignedTransactionFee(spend, { [prevTxId]: rogueTx.toHex() })).toThrow(AssertionError)
    expect(() => getSignedTransactionFee(spend, { [prevTxId]: rogueTx.toHex() })).toThrow('Previous transaction id mismatch')
  })
})
