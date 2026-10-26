import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals'

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

describe('on the Bare runtime (bare-tls)', () => {
  function createBareTlsSocket () {
    const listeners = {}
    const tcp = { setKeepAlive: jest.fn(), setNoDelay: jest.fn(), setTimeout: jest.fn() }

    return {
      socket: tcp,
      on: jest.fn(),
      once: jest.fn((event, handler) => { listeners[event] = handler }),
      emit: (event) => listeners[event]?.(),
      setEncoding: jest.fn()
    }
  }

  beforeEach(() => {
    globalThis.Bare = {}
    tlsConnect.mockReset()
  })

  afterEach(() => {
    delete globalThis.Bare
  })

  test('calls back once the TLS handshake is done, not when TCP connects', () => {
    const socket = createBareTlsSocket()
    tlsConnect.mockReturnValue(socket)
    const client = new ElectrumTls({ host: HOST, port: PORT })
    const callback = jest.fn()

    client._client.conn.connect(PORT, HOST, callback)

    expect(tlsConnect).toHaveBeenCalledWith(expect.objectContaining({
      rejectUnauthorized: true,
      servername: HOST
    }), undefined)
    expect(callback).not.toHaveBeenCalled()
    socket.emit('connect')
    expect(callback).toHaveBeenCalledTimes(1)
  })

  test('forwards setTimeout, setKeepAlive and setNoDelay to the TCP socket', () => {
    const socket = createBareTlsSocket()
    tlsConnect.mockReturnValue(socket)
    const client = new ElectrumTls({ host: HOST, port: PORT })

    // The client's TLS wrapper sets them right after tls.connect().
    client._client.conn.connect(PORT, HOST)

    expect(socket.socket.setTimeout).toHaveBeenCalled()
    expect(socket.socket.setKeepAlive).toHaveBeenCalled()
    expect(socket.socket.setNoDelay).toHaveBeenCalled()
    expect(socket.setTimeout(10)).toBe(socket)
    expect(socket.socket.setTimeout).toHaveBeenLastCalledWith(10)
  })

  test('keeps the methods a fixed bare-tls already has', () => {
    const socket = createBareTlsSocket()
    const own = jest.fn(() => socket)
    socket.setTimeout = own
    tlsConnect.mockReturnValue(socket)
    const client = new ElectrumTls({ host: HOST, port: PORT })

    client._client.conn.connect(PORT, HOST)

    expect(own).toHaveBeenCalled()
    expect(socket.socket.setTimeout).not.toHaveBeenCalled()
  })
})

test('does not replace the plaintext TCP transport', () => {
  const client = new ElectrumTcp({ host: HOST, port: PORT })

  expect(client._client.conn._tls).toBeUndefined()
})
