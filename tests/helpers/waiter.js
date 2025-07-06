import net from 'net'
import zmq from 'zeromq'
import { execSync } from 'child_process'

export default class Waiter {
  constructor (rpcDataDir, zmqHost, zmqPort, interval = 50, timeout = 3_000) {
    this._rpcDataDir = rpcDataDir
    this._sub = new zmq.Subscriber()
    this._sub.connect(`tcp://${zmqHost}:${zmqPort}`)
    this._topics = new Set()
    this._interval = interval
    this._timeout = timeout
  }

  // ensure each zmq topic is subscribed to only once
  _ensureTopic (topic) {
    if (!this._topics.has(topic)) {
      this._sub.subscribe(topic)
      this._topics.add(topic)
    }
  }

  // wait for zmq to publish expected no of blocks
  async waitForBlocks (expected) {
    this._ensureTopic('hashblock')

    const receive = (async () => {
      let count = 0
      for await (const [topic] of this._sub) {
        if (topic.toString() === 'hashblock' && ++count >= expected) {
          return
        }
      }
    })()

    const timer = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout waiting for zmq blocks')), this._timeout)
    )

    await Promise.race([receive, timer])
  }

  // poll fn until it returns true or timeout
  async _waitUntilCondition (fn) {
    const start = Date.now()

    while (true) {
      if (await fn()) return
      if (Date.now() - start > this._timeout) {
        throw new Error('timeout waiting for condition')
      }
      await new Promise(r => setTimeout(r, this._interval))
    }
  }

  // wait until `bitcoin-cli ... getblockchaininfo` succeeds
  async waitUntilRpcReady () {
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

  // wait until `bitcoin-cli ... getblockchaininfo` fails
  async waitUntilRpcStopped () {
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

  // wait until tcp port accepts connections
  async waitUntilPortOpen (host, port) {
    return this._waitUntilCondition(() => new Promise(res => {
      const s = net.createConnection({ host, port }, () => { s.end(); res(true) })
      s.on('error', () => { s.destroy(); res(false) })
    }))
  }

  // wait until tcp port is refusing connections
  async waitUntilPortClosed (host, port) {
    return this._waitUntilCondition(() => new Promise(res => {
      const s = net.createConnection({ host, port }, () => { s.end(); res(false) })
      s.on('error', () => { s.destroy(); res(true) })
    }))
  }
}
