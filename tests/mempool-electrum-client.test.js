import { beforeEach, describe, expect, jest, test } from '@jest/globals'

const tlsConnect = jest.fn()

jest.unstable_mockModule('node:tls', () => ({ connect: tlsConnect }))

const { ElectrumSsl, ElectrumTcp, ElectrumTls } = await import('../index.js')

const HOST = 'electrum.example.com'
const PORT = 50_002

function createSocket () {
  return {
    on: jest.fn(),
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
    const client = new Transport({ host: HOST, port: PORT })
    const error = Object.assign(new Error('self-signed certificate'), {
      code: 'DEPTH_ZERO_SELF_SIGNED_CERT'
    })
    client._client.initElectrum = jest.fn().mockRejectedValue(error)

    await expect(client.connect()).rejects.toThrow(
      `TLS certificate rejected for ${HOST}: self-signed certificate`
    )
  })
})

test('does not replace the plaintext TCP transport', () => {
  const client = new ElectrumTcp({ host: HOST, port: PORT })

  expect(client._client.conn._tls).toBeUndefined()
})
