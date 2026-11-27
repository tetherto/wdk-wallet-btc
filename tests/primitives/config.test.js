import { describe, expect, test } from '@jest/globals'

import { ValueError } from '@tetherto/wdk-wallet'

import {
  assertPathMatchesConfig,
  getBtcDerivationPathPrefix,
  parsePath,
  resolveNetwork,
  resolveType
} from '../../src/primitives/index.js'

const SUPPORTED_NETWORKS = ['bitcoin', 'testnet', 'regtest']

const UNSUPPORTED_NETWORKS = [
  'mainnet', 'BITCOIN', '', ' bitcoin', null, 0, false,
  'constructor', '__proto__', 'toString'
]

const SUPPORTED_TYPES = ['p2pkh', 'p2wpkh']

const INVALID_SEGMENT_PATHS = [
  ['', ''],
  ['m//0', ''],
  ['01', '01'],
  ['-1', '-1'],
  ['1.5', '1.5'],
  ['0x1', '0x1'],
  ['1h', '1h'],
  ["1''", "1''"],
  ['a', 'a'],
  ['M/0', 'M'],
  ['2147483648', '2147483648']
]

const PREFIXES = [
  ['bitcoin', 'p2pkh', "44'/0'"],
  ['bitcoin', 'p2wpkh', "84'/0'"],
  ['testnet', 'p2pkh', "44'/1'"],
  ['testnet', 'p2wpkh', "84'/1'"],
  ['regtest', 'p2pkh', "44'/1'"],
  ['regtest', 'p2wpkh', "84'/1'"]
]

const NON_STRING_PATHS = [undefined, null, 5, {}, ['m']]

const UNSUPPORTED_TYPES = [
  'legacy', 'segwit', 'bip84', 'P2WPKH', '', ' p2wpkh', null, 84, false,
  'constructor', '__proto__', 'toString'
]

describe('resolveNetwork', () => {
  test.each(SUPPORTED_NETWORKS)('should return %s as is', (network) => {
    expect(resolveNetwork(network)).toBe(network)
  })

  test('should default to bitcoin if the network is undefined', () => {
    expect(resolveNetwork(undefined)).toBe('bitcoin')
    expect(resolveNetwork()).toBe('bitcoin')
  })

  test.each(UNSUPPORTED_NETWORKS)('should throw if the network is %p', (network) => {
    expect(() => resolveNetwork(network)).toThrow(ValueError)
    expect(() => resolveNetwork(network)).toThrow(`The network '${network}' is not supported.`)
  })
})

describe('resolveType', () => {
  test.each(SUPPORTED_TYPES)('should return %s as is', (type) => {
    expect(resolveType(type)).toBe(type)
  })

  test('should default to p2wpkh if the type is undefined', () => {
    expect(resolveType(undefined)).toBe('p2wpkh')
    expect(resolveType()).toBe('p2wpkh')
  })

  test.each(UNSUPPORTED_TYPES)('should throw if the type is %p', (type) => {
    expect(() => resolveType(type)).toThrow(ValueError)
    expect(() => resolveType(type)).toThrow(`The script type '${type}' is not supported.`)
  })
})

describe('parsePath', () => {
  test('should parse an absolute path', () => {
    expect(parsePath("m/84'/0'/0'/0/5")).toEqual({
      absolute: true,
      segments: [
        { index: 84, hardened: true },
        { index: 0, hardened: true },
        { index: 0, hardened: true },
        { index: 0, hardened: false },
        { index: 5, hardened: false }
      ]
    })
  })

  test('should parse a relative path', () => {
    expect(parsePath("0'/0/1")).toEqual({
      absolute: false,
      segments: [
        { index: 0, hardened: true },
        { index: 0, hardened: false },
        { index: 1, hardened: false }
      ]
    })
  })

  test('should parse the master path as absolute without segments', () => {
    expect(parsePath('m')).toEqual({ absolute: true, segments: [] })
  })

  test.each([
    ['0', { index: 0, hardened: false }],
    ["0'", { index: 0, hardened: true }],
    ['2147483647', { index: 2147483647, hardened: false }],
    ["2147483647'", { index: 2147483647, hardened: true }]
  ])('should parse the single segment %s', (path, segment) => {
    expect(parsePath(path)).toEqual({ absolute: false, segments: [segment] })
  })

  test.each(INVALID_SEGMENT_PATHS)('should throw if the path is %p', (path, segment) => {
    const message = `The derivation path '${path}' is invalid: '${segment}' is not a valid segment.`

    expect(() => parsePath(path)).toThrow(ValueError)
    expect(() => parsePath(path)).toThrow(message)
  })

  test.each(NON_STRING_PATHS)('should throw if the path is the non-string %p', (path) => {
    expect(() => parsePath(path)).toThrow(ValueError)
    expect(() => parsePath(path)).toThrow('The derivation path must be a string.')
  })
})

describe('assertPathMatchesConfig', () => {
  const CONFIG = { network: 'bitcoin', type: 'p2wpkh' }

  test.each([
    ["m/44'/0'/0'/0/0", 'p2pkh'],
    ["m/84'/0'/0'/0/0", 'p2wpkh']
  ])('should accept %s for the type %s', (path, type) => {
    expect(() => assertPathMatchesConfig(path, { network: 'bitcoin', type })).not.toThrow()
  })

  test.each([
    ["m/44'/0'/0'/0/0", 'p2wpkh', "The path purpose 44' does not match the type 'p2wpkh'."],
    ["m/84'/0'/0'/0/0", 'p2pkh', "The path purpose 84' does not match the type 'p2pkh'."]
  ])('should throw for %s with the type %s', (path, type, message) => {
    expect(() => assertPathMatchesConfig(path, { network: 'bitcoin', type })).toThrow(ValueError)
    expect(() => assertPathMatchesConfig(path, { network: 'bitcoin', type })).toThrow(message)
  })

  test.each([
    ["m/84'/0'/0'/0/0", 'bitcoin'],
    ["m/84'/1'/0'/0/0", 'testnet'],
    ["m/84'/1'/0'/0/0", 'regtest']
  ])('should accept %s for the network %s', (path, network) => {
    expect(() => assertPathMatchesConfig(path, { network, type: 'p2wpkh' })).not.toThrow()
  })

  test.each([
    ["m/84'/1'/0'/0/0", 'bitcoin', "The path coin type 1' does not match the network 'bitcoin'."],
    ["m/84'/0'/0'/0/0", 'testnet', "The path coin type 0' does not match the network 'testnet'."],
    ["m/84'/0'/0'/0/0", 'regtest', "The path coin type 0' does not match the network 'regtest'."]
  ])('should throw for %s with the network %s', (path, network, message) => {
    expect(() => assertPathMatchesConfig(path, { network, type: 'p2wpkh' })).toThrow(ValueError)
    expect(() => assertPathMatchesConfig(path, { network, type: 'p2wpkh' })).toThrow(message)
  })

  test.each([49, 86])('should throw if the purpose is the unsupported %i\'', (purpose) => {
    const check = () => assertPathMatchesConfig(`m/${purpose}'/0'/0'/0/0`, CONFIG)

    expect(check).toThrow(ValueError)
    expect(check).toThrow(`The path purpose ${purpose}' is not supported.`)
  })

  test('should check the purpose before the coin type', () => {
    const check = () => assertPathMatchesConfig("m/44'/1'/0'/0/0", CONFIG)

    expect(check).toThrow("The path purpose 44' does not match the type 'p2wpkh'.")
  })

  test.each([
    ["m/9'/2'/0'/0/0"],
    ["m/44/1/0'/0/0"],
    ["m/84'/1/0'/0/0"],
    ["m/84'/0'"],
    ["m/84'"],
    ['m']
  ])('should not check %s', (path) => {
    expect(() => assertPathMatchesConfig(path, CONFIG)).not.toThrow()
  })

  test('should throw if the path is relative', () => {
    const check = () => assertPathMatchesConfig("0'/0/0", CONFIG)

    expect(check).toThrow(ValueError)
    expect(check).toThrow("The path '0'/0/0' must be absolute (start with 'm').")
  })

  test('should throw if the path is invalid', () => {
    const check = () => assertPathMatchesConfig("m/84'/a'", CONFIG)

    expect(check).toThrow(ValueError)
    expect(check).toThrow("The derivation path 'm/84'/a'' is invalid: 'a'' is not a valid segment.")
  })
})

describe('getBtcDerivationPathPrefix', () => {
  test.each(PREFIXES)('should return the prefix of %s and %s', (network, type, prefix) => {
    expect(getBtcDerivationPathPrefix({ network, type })).toBe(prefix)
  })

  test.each(PREFIXES)('should return a prefix that agrees with %s and %s', (network, type) => {
    const prefix = getBtcDerivationPathPrefix({ network, type })

    expect(() => assertPathMatchesConfig(`m/${prefix}`, { network, type })).not.toThrow()
  })

  test('should default to bitcoin and p2wpkh if the config is undefined', () => {
    expect(getBtcDerivationPathPrefix()).toBe("84'/0'")
  })

  test('should default to bitcoin and p2wpkh if the config is empty', () => {
    expect(getBtcDerivationPathPrefix({})).toBe("84'/0'")
  })

  test('should default to p2wpkh if only the network is given', () => {
    expect(getBtcDerivationPathPrefix({ network: 'regtest' })).toBe("84'/1'")
  })

  test('should default to bitcoin if only the type is given', () => {
    expect(getBtcDerivationPathPrefix({ type: 'p2pkh' })).toBe("44'/0'")
  })

  test('should throw if the network is not supported', () => {
    const check = () => getBtcDerivationPathPrefix({ network: 'mainnet' })

    expect(check).toThrow(ValueError)
    expect(check).toThrow("The network 'mainnet' is not supported.")
  })

  test('should throw if the type is not supported', () => {
    const check = () => getBtcDerivationPathPrefix({ type: 'bip84' })

    expect(check).toThrow(ValueError)
    expect(check).toThrow("The script type 'bip84' is not supported.")
  })
})
