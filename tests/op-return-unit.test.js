// Unit tests for the OP_RETURN memo support added to
// WalletAccountBtc.sendTransaction / signTransaction.
//
// Place at: tests/op-return-unit.test.js in the wdk-wallet-btc repo.
// Run with: npm run test:unit

import { payments } from 'bitcoinjs-lib'

import { _normalizeMemo, MAX_OP_RETURN_BYTES } from '../src/wallet-account-btc.js'
import { _opReturnVBytes } from '../src/wallet-account-read-only-btc.js'

const SAMPLE_MEMO = '=:e:0xe89E630553e63EA65b65F1cA2ea2C50cCA8f3E54:32324827:commission/SDK:444/5'

describe('_normalizeMemo', () => {
  test('returns null for undefined / null / empty', () => {
    expect(_normalizeMemo(undefined)).toBeNull()
    expect(_normalizeMemo(null)).toBeNull()
    expect(_normalizeMemo('')).toBeNull()
  })

  test('encodes strings as UTF-8 buffers', () => {
    const buf = _normalizeMemo('hello')
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.toString('utf8')).toBe('hello')
    expect(buf.length).toBe(5)
  })

  test('passes through Buffer inputs', () => {
    const input = Buffer.from([0x01, 0x02, 0x03])
    const out = _normalizeMemo(input)
    expect(out.equals(input)).toBe(true)
  })

  test('converts Uint8Array inputs to Buffer', () => {
    const u8 = new Uint8Array([0xaa, 0xbb, 0xcc])
    const out = _normalizeMemo(u8)
    expect(Buffer.isBuffer(out)).toBe(true)
    expect(out.equals(Buffer.from(u8))).toBe(true)
  })

  test('accepts payloads up to the 80-byte standardness cap', () => {
    const ok = 'x'.repeat(MAX_OP_RETURN_BYTES)
    expect(() => _normalizeMemo(ok)).not.toThrow()
  })

  test('rejects payloads above the 80-byte standardness cap', () => {
    const tooBig = 'x'.repeat(MAX_OP_RETURN_BYTES + 1)
    expect(() => _normalizeMemo(tooBig)).toThrow(RangeError)
  })

  test('accepts a THORChain-style memo (~70 bytes)', () => {
    const buf = _normalizeMemo(SAMPLE_MEMO)
    expect(buf).not.toBeNull()
    expect(buf.length).toBeLessThanOrEqual(MAX_OP_RETURN_BYTES)
  })
})

describe('_opReturnVBytes', () => {
  test('is 0 when no payload', () => {
    expect(_opReturnVBytes(0)).toBe(0)
    expect(_opReturnVBytes(undefined)).toBe(0)
    expect(_opReturnVBytes(null)).toBe(0)
  })

  test('uses the small-push form for payloads ≤ 75 bytes', () => {
    expect(_opReturnVBytes(1)).toBe(13)
    expect(_opReturnVBytes(70)).toBe(82)
    expect(_opReturnVBytes(75)).toBe(87)
  })

  test('uses the OP_PUSHDATA1 form for 76 ≤ payload ≤ 80', () => {
    expect(_opReturnVBytes(76)).toBe(89)
    expect(_opReturnVBytes(80)).toBe(93)
  })
})

describe('OP_RETURN output script (via payments.embed)', () => {
  test('encodes the small-push form for short memos', () => {
    const memo = _normalizeMemo('hi')
    const script = payments.embed({ data: [memo] }).output
    expect(script[0]).toBe(0x6a) // OP_RETURN
    expect(script[1]).toBe(memo.length) // direct push opcode
    expect(script.slice(2).equals(memo)).toBe(true)
  })

  test('encodes OP_PUSHDATA1 for memos ≥ 76 bytes', () => {
    const memo = _normalizeMemo('y'.repeat(78))
    const script = payments.embed({ data: [memo] }).output
    expect(script[0]).toBe(0x6a) // OP_RETURN
    expect(script[1]).toBe(0x4c) // OP_PUSHDATA1
    expect(script[2]).toBe(memo.length)
    expect(script.slice(3).equals(memo)).toBe(true)
  })

  test('round-trips the THORChain sample memo bytes verbatim', () => {
    const memo = _normalizeMemo(SAMPLE_MEMO)
    const script = payments.embed({ data: [memo] }).output
    const offset = memo.length < 76 ? 2 : 3
    expect(script.slice(offset).toString('utf8')).toBe(SAMPLE_MEMO)
  })
})
