import { describe, expect, test } from '@jest/globals'

import * as descriptors from '@bitcoinerlab/descriptors'
import { getEccLib } from 'bitcoinjs-lib/src/ecc_lib'

import { BIP32, ECPair, Output, bitcoinMessage, ecc } from '../src/crypto-engine.js'

describe('crypto-engine', () => {
  test('should expose the ecc bound by @bitcoinerlab/descriptors', () => {
    expect(ecc).toBe(descriptors.ecc)
    expect(BIP32).toBe(descriptors.BIP32)
    expect(ECPair).toBe(descriptors.ECPair)
    expect(Output).toBe(descriptors.Output)
  })

  test('should initialise bitcoinjs-lib with the same ecc instance', () => {
    expect(getEccLib()).toBe(ecc)
  })

  test('should build the message signer', () => {
    expect(typeof bitcoinMessage.sign).toBe('function')
  })
})
