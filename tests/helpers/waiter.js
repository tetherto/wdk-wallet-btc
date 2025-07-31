import net from 'net'

import zmq from 'zeromq'

const TIMEOUT = 3_000

const POLLING_INTERVAL = 50

export default class Waiter {
  constructor (bitcoin, config) {
    const { host, electrumPort, zmqPort } = config

    this._bitcoin = bitcoin

    this._host = host
    this._port = electrumPort

    this._subscriber = new zmq.Subscriber({ linger: 0 })
    this._subscriber.connect(`tcp://${host}:${zmqPort}`)
  }

  async waitUntilPortIsOpen (host, port) {
    await this._waitUntilCondition(() => {
      return new Promise(resolve => {
        const socket = net.createConnection({ host, port }, () => {
          socket.end()
          resolve(true)
        })

        socket.on('error', () => {
          socket.destroy()
          resolve(false)
        })

        socket.unref()
      })
    })
  }

  async waitUntilPortIsClosed (host, port) {
    await this._waitUntilCondition(() => {
      return new Promise(resolve => {
        const socket = net.createConnection({ host, port }, () => {
          socket.end()
          resolve(false)
        })

        socket.on('error', () => {
          socket.destroy()
          resolve(true)
        })

        socket.unref()
      })
    })
  }

  async mine (blocks = 1) {
    this._subscriber.subscribe('hashblock')

    const miner = this._bitcoin.getNewAddress()
    this._bitcoin.generateToAddress(blocks, miner)
    await this._waitForBlocks(blocks)
  }

  async _waitForBlocks (blocks) {
    const timeout = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Waiter timed out waiting for blocks.'))
      }, TIMEOUT)

      timer.unref()
    })

    const task = async () => {
      let count = 0

      for await (const [topic] of this._subscriber) {
        if (topic.toString() === 'hashblock' && ++count === blocks) {
          break
        }
      }

      await this._waitForElectrumServer()
    }

    await Promise.race([timeout, task()])
  }

  async _waitForElectrumServer () {
    const targetBlockCount = this._bitcoin.getBlockCount()

    await this._waitUntilCondition(async () => {
      const blockCount = await this._getElectrumServerBlockCount()

      return blockCount === targetBlockCount
    })
  }

  _getElectrumServerBlockCount () {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this._host, port: this._port }, () => {
        const request = {
          jsonrpc: '2.0',
          id: 0,
          method: 'blockchain.headers.subscribe',
          params: []
        }

        socket.write(JSON.stringify(request) + '\n')
      })

      socket.on('data', chunk => {
        const messages = chunk.toString().split('\n')

        for (const message of messages) {
          try {
            const data = JSON.parse(message)
            socket.end()
            resolve(data.result.height)
          } catch (_) {

          }
        }
      })

      socket.on('error', error => {
        socket.destroy()
        reject(error)
      })

      socket.unref()
    })
  }

  async _waitUntilCondition (condition) {
    const timestamp = Date.now()

    while (true) {
      if (await condition()) {
        break
      }

      if (Date.now() - timestamp > TIMEOUT) {
        throw new Error('Waiter timed out waiting for condition.')
      }

      await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL))
    }
  }
}
