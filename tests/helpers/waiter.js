import net from 'net'
import zmq from 'zeromq'
import { execSync } from 'child_process'

export default class Waiter {
  constructor(rpcDataDir, host, zmqPort, electrumPort, interval = 50, timeout = 3000) {
    this._rpcDataDir = rpcDataDir
    this._sub = new zmq.Subscriber()
    this._sub.connect(`tcp://${host}:${zmqPort}`)
    this._topics = new Set()
    this._electrumHost = host
    this._electrumPort = electrumPort
    this._interval = interval
    this._timeout = timeout
  }

  // ensure zmq topic subscribed only once
  _ensureTopic(topic) {
    if (!this._topics.has(topic)) {
      this._sub.subscribe(topic)
      this._topics.add(topic)
    }
  }

  // get bitcoin core block height via cli
  _getCoreHeight() {
    const out = execSync(
      `bitcoin-cli -regtest -datadir=${this._rpcDataDir} getblockcount`,
      { stdio: 'pipe' }
    ).toString().trim()
    return Number(out)
  }

  // get electrum server block height via rpc call
  async _getElectrumHeight() {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket()
      socket.setEncoding('utf8')
      socket.connect(this._electrumPort, this._electrumHost, () => {
        socket.write(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 0,
            method: 'blockchain.headers.subscribe',
            params: []
          }) + '\n'
        )
      })
      socket.on('data', chunk => {
        try {
          const res = JSON.parse(chunk)
          socket.destroy()
          resolve(res.result.height)
        } catch {
          // ignore non-json data
        }
      })
      socket.on('error', err => {
        socket.destroy()
        reject(err)
      })
    })
  }

  // wait for core to emit expected hashblock messages
  async _waitForCoreBlocks(expected) {
    this._ensureTopic('hashblock')

    const receive = (async () => {
      let count = 0
      for await (const [topic] of this._sub) {
        if (topic.toString() === 'hashblock' && ++count >= expected) {
          return
        }
      }
    })()

    await receive
  }

  // wait for electrum to catch up to core height
  async _waitForElectrumSync() {
    const target = this._getCoreHeight()
    await this._waitUntilCondition(async () => {
      const height = await this._getElectrumHeight()
      return height === target
    })
  }

  // wait for both core and electrum to process expected no. of new blocks
  async waitForBlocks(expected) {
    const overall = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout waiting for blocks')), this._timeout)
    )
    const task = (async () => {
      await this._waitForCoreBlocks(expected)
      await this._waitForElectrumSync()
    })()
    await Promise.race([task, overall])
  }

  // poll fn until true or timeout
  async _waitUntilCondition(fn) {
    const start = Date.now()
    while (true) {
      if (await fn()) return
      if (Date.now() - start > this._timeout) {
        throw new Error('timeout waiting for condition')
      }
      await new Promise(r => setTimeout(r, this._interval))
    }
  }

  // wait until rpc responds
  async waitUntilRpcReady() {
    return this._waitUntilCondition(() => {
      try {
        execSync(
          `bitcoin-cli -regtest -rpcwait -datadir=${this._rpcDataDir} getblockchaininfo`,
          { stdio: 'ignore' }
        )
        return true
      } catch {
        return false
      }
    })
  }

  // wait until rpc stops responding
  async waitUntilRpcStopped() {
    return this._waitUntilCondition(() => {
      try {
        execSync(
          `bitcoin-cli -regtest -datadir=${this._rpcDataDir} getblockchaininfo`,
          { stdio: 'ignore' }
        )
        return false
      } catch {
        return true
      }
    })
  }

  // wait until tcp port opens
  async waitUntilPortOpen(host, port) {
    return this._waitUntilCondition(() =>
      new Promise(res => {
        const s = net.createConnection({ host, port }, () => {
          s.end()
          res(true)
        })
        s.on('error', () => {
          s.destroy()
          res(false)
        })
      })
    )
  }

  // wait until tcp port closes
  async waitUntilPortClosed(host, port) {
    return this._waitUntilCondition(() =>
      new Promise(res => {
        const s = net.createConnection({ host, port }, () => {
          s.end()
          res(false)
        })
        s.on('error', () => {
          s.destroy()
          res(true)
        })
      })
    )
  }
}
