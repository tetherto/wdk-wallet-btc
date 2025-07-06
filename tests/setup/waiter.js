import net from 'net'
import zmq from 'zeromq'
import { execSync } from 'child_process'

export default class Waiter {
  // poll fn until it returns true or timeout
  static async waitUntilCondition(fn, interval = 100, timeout = 30_000) {
    const start = Date.now()
    while (true) {
      if (await fn()) return
      if (Date.now() - start > timeout) throw new Error('timeout waiting for condition')
      await new Promise(r => setTimeout(r, interval))
    }
  }

  // wait until `bitcoin-cli ... getblockchaininfo` succeeds
  static async waitUntilRpcReady(datadir) {
    return Waiter.waitUntilCondition(() => {
      try {
        execSync(
          `bitcoin-cli -regtest -rpcwait -datadir=${datadir} getblockchaininfo`,
          { stdio: 'ignore' }
        )
        return true
      } catch {
        return false
      }
    })
  }

  // wait until `bitcoin-cli ... getblockchaininfo` starts failing
  static async waitUntilRpcStopped(datadir) {
    return Waiter.waitUntilCondition(() => {
      try {
        execSync(
          `bitcoin-cli -regtest -datadir=${datadir} getblockchaininfo`,
          { stdio: 'ignore' }
        )
        return false
      } catch {
        return true
      }
    })
  }

  // wait for zmq to publish expected no of blocks
  static async waitForBlocks(expected, host, port, timeout = 30_000) {
    const sub = new zmq.Subscriber()
    sub.connect(`tcp://${host}:${port}`)
    sub.subscribe('hashblock')

    let count = 0
    const timer = setTimeout(() => {
      sub.close()
      throw new Error('timeout waiting for zmq blocks')
    }, timeout)

    try {
      for await (const [topic] of sub) {
        if (topic.toString() === 'hashblock' && ++count >= expected) break
      }
    } finally {
      clearTimeout(timer)
      sub.close()
    }
  }

  // wait until tcp port accepts connections
  static async waitUntilPortOpen(host, port) {
    return Waiter.waitUntilCondition(() => new Promise(res => {
      const s = net.createConnection({ host, port }, () => { s.end(); res(true) })
      s.on('error', () => { s.destroy(); res(false) })
    }))
  }

  // wait until tcp port is refusing connections
  static async waitUntilPortClosed(host, port) {
    return Waiter.waitUntilCondition(() => new Promise(res => {
      const s = net.createConnection({ host, port }, () => { s.end(); res(false) })
      s.on('error', () => { s.destroy(); res(true) })
    }))
  }
}
