import { describe, expect, test } from '@jest/globals'

import { address as btcAddress, networks } from 'bitcoinjs-lib'

import { getDustLimit } from '../../src/primitives/dust.js'

const BIP84_RECEIVE_ADDRESS = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu'
const BIP44_RECEIVE_ADDRESS = '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA'

function buildScript (prefix, bodyLength, suffix = []) {
  return Uint8Array.from([...prefix, ...new Array(bodyLength).fill(0xab), ...suffix])
}

describe('getDustLimit', () => {
  describe('with standard scripts', () => {
    test.each([
      ['P2PKH', buildScript([0x76, 0xa9, 0x14], 20, [0x88, 0xac]), 546n],
      ['P2SH', buildScript([0xa9, 0x14], 20, [0x87]), 540n],
      ['P2WPKH', buildScript([0x00, 0x14], 20), 294n],
      ['P2WSH', buildScript([0x00, 0x20], 32), 330n],
      ['P2TR', buildScript([0x51, 0x20], 32), 330n]
    ])('should return the dust limit of a %s output', (_, script, expected) => {
      expect(getDustLimit(script)).toBe(expected)
    })
  })

  describe('with addresses', () => {
    test('should return 294 for a native segwit address', () => {
      const script = btcAddress.toOutputScript(BIP84_RECEIVE_ADDRESS, networks.bitcoin)

      expect(getDustLimit(script)).toBe(294n)
    })

    test('should return 546 for a legacy address', () => {
      const script = btcAddress.toOutputScript(BIP44_RECEIVE_ADDRESS, networks.bitcoin)

      expect(getDustLimit(script)).toBe(546n)
    })
  })

  describe('witness program detection', () => {
    test('should accept the highest witness version', () => {
      expect(getDustLimit(buildScript([0x60, 0x20], 32))).toBe(330n)
    })

    test('should not treat a script as a witness program if the push length does not match', () => {
      expect(getDustLimit(buildScript([0x00, 0x14], 21))).toBe(540n)
    })

    test('should not treat a script as a witness program if the first opcode is not a witness version', () => {
      expect(getDustLimit(buildScript([0x61, 0x14], 20))).toBe(537n)
    })
  })
})
