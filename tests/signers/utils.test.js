import { describe, expect, test } from '@jest/globals'

import { networks } from 'bitcoinjs-lib'

import { getAddressFromPublicKey } from '../../src/signers/utils.js'

// The public key of the private key 00..01
const GENERATOR_PUBLIC_KEY = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'

const GENERATOR_ADDRESSES = {
  bitcoin: {
    segwit: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    legacy: '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH'
  },
  testnet: {
    segwit: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
    legacy: 'mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8r'
  },
  regtest: {
    segwit: 'bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080',
    legacy: 'mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8r'
  }
}

const ACCOUNT_PUBLIC_KEY = '035a48902f37c03901f36fea0a06aef2be29d9c55da559f5bd02c2d02d2b516382'

const ACCOUNT_ADDRESSES = {
  bitcoin: {
    segwit: 'bc1qxn0te9ecv864wtu53cccjhuuy5dphvem6ykeyr',
    legacy: '15pYxzVN93R1xnG19ZiCFdLoJDDh36qKuD'
  },
  testnet: {
    segwit: 'tb1qxn0te9ecv864wtu53cccjhuuy5dphvemszd2ls',
    legacy: 'mkLWG3aLx4rGjtjcs8ga5YZ8ACpPxWE8t7'
  },
  regtest: {
    segwit: 'bcrt1qxn0te9ecv864wtu53cccjhuuy5dphvemjt58ge',
    legacy: 'mkLWG3aLx4rGjtjcs8ga5YZ8ACpPxWE8t7'
  }
}

describe('getAddressFromPublicKey', () => {
  describe('with the secp256k1 generator public key', () => {
    test.each([
      ['bitcoin', 'segwit'],
      ['bitcoin', 'legacy'],
      ['testnet', 'segwit'],
      ['testnet', 'legacy'],
      ['regtest', 'segwit'],
      ['regtest', 'legacy']
    ])('should return the %s %s address', (network, type) => {
      const publicKey = Buffer.from(GENERATOR_PUBLIC_KEY, 'hex')

      expect(getAddressFromPublicKey(publicKey, networks[network], type))
        .toBe(GENERATOR_ADDRESSES[network][type])
    })
  })

  describe('with an account public key', () => {
    test.each([
      ['bitcoin', 'segwit'],
      ['bitcoin', 'legacy'],
      ['testnet', 'segwit'],
      ['testnet', 'legacy'],
      ['regtest', 'segwit'],
      ['regtest', 'legacy']
    ])('should return the %s %s address of payments.p2wpkh and payments.p2pkh', (network, type) => {
      const publicKey = Buffer.from(ACCOUNT_PUBLIC_KEY, 'hex')

      expect(getAddressFromPublicKey(publicKey, networks[network], type))
        .toBe(ACCOUNT_ADDRESSES[network][type])
    })
  })
})
