import { beforeEach, describe, expect, jest, test } from '@jest/globals'

const tlsConnect = jest.fn()

jest.unstable_mockModule('node:tls', () => ({ connect: tlsConnect }))

const { ElectrumSsl, ElectrumTcp, ElectrumTls } = await import('../index.js')

const HOST = 'electrum.example.com'
const PORT = 50_002

function createSocket (onError) {
  return {
    on: jest.fn((event, handler) => {
      if (event === 'error' && onError) process.nextTick(() => handler(onError))
    }),
    setEncoding: jest.fn(),
    setKeepAlive: jest.fn(),
    setNoDelay: jest.fn(),
    setTimeout: jest.fn()
  }
}

describe.each([
  ['TLS', ElectrumTls],
  ['SSL', ElectrumSsl]
])('%s Electrum transport', (protocol, Transport) => {
  beforeEach(() => {
    tlsConnect.mockReset()
    tlsConnect.mockReturnValue(createSocket())
  })

  test('requires certificate verification and sets the server name', () => {
    const client = new Transport({ host: HOST, port: PORT })

    client._client.conn.connect(PORT, HOST, jest.fn())

    expect(tlsConnect).toHaveBeenCalledWith({
      port: PORT,
      host: HOST,
      rejectUnauthorized: true,
      servername: HOST
    }, expect.any(Function))
  })

  test('keeps certificate verification after the socket is recreated', () => {
    const client = new Transport({ host: HOST, port: PORT })

    client._client.initSocket()
    client._client.conn.connect(PORT, HOST, jest.fn())

    expect(tlsConnect).toHaveBeenCalledWith(expect.objectContaining({
      rejectUnauthorized: true,
      servername: HOST
    }), expect.any(Function))
  })

  test('reports certificate rejection with the host name', async () => {
    const client = new Transport({ host: HOST, port: PORT, maxRetry: 0 })
    const error = Object.assign(new Error('self-signed certificate'), {
      code: 'DEPTH_ZERO_SELF_SIGNED_CERT'
    })
    tlsConnect.mockReturnValue(createSocket(error))

    await expect(client.connect()).rejects.toThrow(
      `TLS certificate rejected for ${HOST}: self-signed certificate`
    )
  })
})

test('does not replace the plaintext TCP transport', () => {
  const client = new ElectrumTcp({ host: HOST, port: PORT })

  expect(client._client.conn._tls).toBeUndefined()
})

describe('ElectrumTcp listUnspent and listSpendable', () => {
  let client

  const stubUnspent = (items) => {
    client._client.blockchainScripthash_listunspent = jest.fn().mockResolvedValue(items)
  }

  beforeEach(() => {
    client = new ElectrumTcp({ host: HOST, port: PORT, network: 'regtest' })
    stubUnspent(unspent)
  })

  const ADDRESS = 'bcrt1q8dqnpagwt9rtl7k38nuaa2ahf690avzkm74nhn'

  const unspent = [
    { tx_hash: 'a'.repeat(64), tx_pos: 0, value: 100_000, height: 105 },
    { tx_hash: 'b'.repeat(64), tx_pos: 1, value: 50_000, height: 0 },
    { tx_hash: 'c'.repeat(64), tx_pos: 2, value: 70_000, height: -1 }
  ]

  const CONFIRMED = { outpoint: { txid: 'a'.repeat(64), vout: 0 }, value: 100_000n, height: 105 }

  test('should return every UTXO from listUnspent and map its fields', async () => {
    const utxos = await client.listUnspent(ADDRESS)

    expect(utxos).toEqual([
      CONFIRMED,
      { outpoint: { txid: 'b'.repeat(64), vout: 1 }, value: 50_000n, height: 0 },
      { outpoint: { txid: 'c'.repeat(64), vout: 2 }, value: 70_000n, height: -1 }
    ])
  })

  test('should drop UTXOs without a block height from listUnspent when confirmed is set', async () => {
    const utxos = await client.listUnspent(ADDRESS, { confirmed: true })

    expect(utxos).toEqual([CONFIRMED])
  })

  test('should return only the confirmed UTXOs from listSpendable', async () => {
    const utxos = await client.listSpendable(ADDRESS)

    expect(utxos).toEqual([CONFIRMED])
  })

  test('should return an empty list from listSpendable when every UTXO is unconfirmed', async () => {
    stubUnspent(unspent.slice(1))

    expect(await client.listSpendable(ADDRESS)).toEqual([])
  })
})
