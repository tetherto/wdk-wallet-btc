import { describe, expect, test } from '@jest/globals'

import * as bip39 from 'bip39'
import { networks, payments } from 'bitcoinjs-lib'

import { ValueError } from '@tetherto/wdk-wallet'

import { BIP32, Output } from '../../src/crypto-engine.js'
import { getAddressDescriptor, getDescriptor } from '../../src/primitives/descriptor.js'

// BIP-84 test vectors (mnemonic "abandon ... about", account 0, mainnet).
const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const XPUB_84 = 'xpub6CatWdiZiodmUeTDp8LT5or8nmbKNcuyvz7WyksVFkKB4RHwCD3XyuvPEbvqAQY3rAPshWcMLoP2fMFMKHPJ4ZeZXYVUhLv1VMrjPC7PW6V'
const BIP84_RECEIVE_ADDRESS = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu'
const BIP84_CHANGE_ADDRESS = 'bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el'
const MASTER_FINGERPRINT = '73c5da0a'
const ORIGIN_PATH = "/84'/0'/0'"

// BIP-44 fixtures for the same mnemonic (account 0, mainnet).
const XPUB_44 = 'xpub6BosfCnifzxcFwrSzQiqu2DBVTshkCXacvNsWGYJVVhhawA7d4R5WSWGFNbi8Aw6ZRc1brxMyWMzG3DSSSSoekkudhUd9yLb6qx39T9nMdj'
const BIP44_RECEIVE_ADDRESS = '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA'

// Fixtures for the private key used in the signer tests.
const PUBLIC_KEY = '02f8044c82d6b9dfcfc3e6f3424cb11cc747bb34766bcbef72d2f52f6c4e8e07aa'
const SEGWIT_MAINNET_ADDRESS = 'bc1q9lpn7ks92lekmr6m0gpy4qyzyq8g98nufpddma'
const LEGACY_REGTEST_ADDRESS = 'mjsVx6s5oH9VqwmhfjCyVo6t7APRGY6T8o'

function getAddress (descriptor, params = {}) {
  return new Output({ descriptor, network: networks.bitcoin, ...params }).getAddress()
}

describe('getDescriptor', () => {
  describe('with an extended public key', () => {
    test('should build a segwit descriptor and derive the BIP-84 receive address', () => {
      const descriptor = getDescriptor({ type: 'segwit', xpub: XPUB_84, keyPath: '/0/*' })

      expect(descriptor).toBe(`wpkh(${XPUB_84}/0/*)`)
      expect(getAddress(descriptor, { index: 0 })).toBe(BIP84_RECEIVE_ADDRESS)
    })

    test('should build a legacy descriptor and derive the BIP-44 receive address', () => {
      const descriptor = getDescriptor({ type: 'legacy', xpub: XPUB_44, keyPath: '/0/*' })

      expect(descriptor).toBe(`pkh(${XPUB_44}/0/*)`)
      expect(getAddress(descriptor, { index: 0 })).toBe(BIP44_RECEIVE_ADDRESS)
    })

    test('should support a multipath key path for the receive and change branches', () => {
      const descriptor = getDescriptor({ type: 'segwit', xpub: XPUB_84, keyPath: '/<0;1>/*' })

      expect(descriptor).toBe(`wpkh(${XPUB_84}/<0;1>/*)`)
      expect(getAddress(descriptor, { index: 0, change: 0 })).toBe(BIP84_RECEIVE_ADDRESS)
      expect(getAddress(descriptor, { index: 0, change: 1 })).toBe(BIP84_CHANGE_ADDRESS)
    })

    test('should support a fixed key path', () => {
      const descriptor = getDescriptor({ type: 'segwit', xpub: XPUB_84, keyPath: '/0/0' })

      expect(descriptor).toBe(`wpkh(${XPUB_84}/0/0)`)
      expect(getAddress(descriptor)).toBe(BIP84_RECEIVE_ADDRESS)
    })

    test('should use the key as is if the key path is omitted', () => {
      const descriptor = getDescriptor({ type: 'segwit', xpub: XPUB_84 })
      const { address } = payments.p2wpkh({ pubkey: BIP32.fromBase58(XPUB_84).publicKey })

      expect(descriptor).toBe(`wpkh(${XPUB_84})`)
      expect(getAddress(descriptor)).toBe(address)
    })
  })

  describe('with a key origin', () => {
    test('should prefix the key with the fingerprint only', () => {
      const descriptor = getDescriptor({ type: 'segwit', xpub: XPUB_84, keyPath: '/0/*', origin: { fingerprint: MASTER_FINGERPRINT } })

      expect(descriptor).toBe(`wpkh([${MASTER_FINGERPRINT}]${XPUB_84}/0/*)`)
    })

    test('should prefix the key with the fingerprint and the path', () => {
      const descriptor = getDescriptor({ type: 'segwit', xpub: XPUB_84, keyPath: '/0/*', origin: { fingerprint: MASTER_FINGERPRINT, path: ORIGIN_PATH } })

      expect(descriptor).toBe(`wpkh([${MASTER_FINGERPRINT}${ORIGIN_PATH}]${XPUB_84}/0/*)`)
    })

    test('should not change the derived address', () => {
      const descriptor = getDescriptor({ type: 'segwit', xpub: XPUB_84, keyPath: '/0/*', origin: { fingerprint: MASTER_FINGERPRINT, path: ORIGIN_PATH } })

      expect(getAddress(descriptor, { index: 0 })).toBe(BIP84_RECEIVE_ADDRESS)
    })

    test('should throw if the origin has no fingerprint', () => {
      const build = () => getDescriptor({ type: 'segwit', xpub: XPUB_84, origin: { path: ORIGIN_PATH } })

      expect(build).toThrow(ValueError)
      expect(build).toThrow("The key origin requires a 'fingerprint'.")
    })
  })

  describe('with a bare public key', () => {
    test('should build a segwit descriptor and derive the signer address', () => {
      const descriptor = getDescriptor({ type: 'segwit', pubkey: PUBLIC_KEY })

      expect(descriptor).toBe(`wpkh(${PUBLIC_KEY})`)
      expect(getAddress(descriptor)).toBe(SEGWIT_MAINNET_ADDRESS)
    })

    test('should build a legacy descriptor and derive the signer address', () => {
      const descriptor = getDescriptor({ type: 'legacy', pubkey: PUBLIC_KEY })

      expect(descriptor).toBe(`pkh(${PUBLIC_KEY})`)
      expect(getAddress(descriptor, { network: networks.regtest })).toBe(LEGACY_REGTEST_ADDRESS)
    })

    test('should prefix the key with the origin', () => {
      const origin = { fingerprint: MASTER_FINGERPRINT, path: "/84'/0'/0'/0/0" }
      const descriptor = getDescriptor({ type: 'segwit', pubkey: PUBLIC_KEY, origin })

      expect(descriptor).toBe(`wpkh([${MASTER_FINGERPRINT}/84'/0'/0'/0/0]${PUBLIC_KEY})`)
      expect(getAddress(descriptor)).toBe(SEGWIT_MAINNET_ADDRESS)
    })

    test('should throw if a key path is given', () => {
      const build = () => getDescriptor({ type: 'segwit', pubkey: PUBLIC_KEY, keyPath: '/0' })

      expect(build).toThrow(ValueError)
      expect(build).toThrow("A bare public key cannot be derived: 'keyPath' is only valid with 'xpub'.")
    })
  })

  describe('with a master node', () => {
    const masterNode = BIP32.fromSeed(bip39.mnemonicToSeedSync(MNEMONIC), networks.bitcoin)

    test('should build the same descriptor as the extended public key with its origin', () => {
      const descriptor = getDescriptor({ type: 'segwit', masterNode, origin: { path: ORIGIN_PATH }, keyPath: '/0/*' })

      expect(descriptor).toBe(`wpkh([${MASTER_FINGERPRINT}${ORIGIN_PATH}]${XPUB_84}/0/*)`)
      expect(getAddress(descriptor, { index: 0 })).toBe(BIP84_RECEIVE_ADDRESS)
    })

    test('should use the derived key as is if the key path is omitted', () => {
      const descriptor = getDescriptor({ type: 'segwit', masterNode, origin: { path: ORIGIN_PATH } })

      expect(descriptor).toBe(`wpkh([${MASTER_FINGERPRINT}${ORIGIN_PATH}]${XPUB_84})`)
    })

    test('should forward the change and the index to the key expression', () => {
      const descriptor = getDescriptor({ type: 'segwit', masterNode, origin: { path: ORIGIN_PATH }, change: 1, index: 0 })

      expect(descriptor).toBe(getDescriptor({ type: 'segwit', xpub: XPUB_84, keyPath: '/1/0', origin: { fingerprint: MASTER_FINGERPRINT, path: ORIGIN_PATH } }))
      expect(getAddress(descriptor)).toBe(BIP84_CHANGE_ADDRESS)
    })
  })

  describe('with invalid parameters', () => {
    test('should throw if no key is given', () => {
      const build = () => getDescriptor({ type: 'segwit' })

      expect(build).toThrow(ValueError)
      expect(build).toThrow("A key is required: provide either 'xpub' or 'pubkey'.")
    })

    test('should throw if both an extended public key and a public key are given', () => {
      const build = () => getDescriptor({ type: 'segwit', xpub: XPUB_84, pubkey: PUBLIC_KEY })

      expect(build).toThrow(ValueError)
      expect(build).toThrow("Provide either 'xpub' or 'pubkey', not both.")
    })

    test.each(['taproot', 'constructor', 'toString', undefined])('should throw if the script type is %s', (type) => {
      const build = () => getDescriptor({ type, xpub: XPUB_84 })

      expect(build).toThrow(ValueError)
      expect(build).toThrow(`The script type '${type}' is not supported.`)
    })
  })
})

describe('getAddressDescriptor', () => {
  test('should wrap the address in an addr descriptor', () => {
    expect(getAddressDescriptor(BIP84_RECEIVE_ADDRESS)).toBe(`addr(${BIP84_RECEIVE_ADDRESS})`)
  })

  test.each([BIP84_RECEIVE_ADDRESS, BIP44_RECEIVE_ADDRESS])('should build an output for the address %s', (address) => {
    expect(getAddress(getAddressDescriptor(address))).toBe(address)
  })
})
