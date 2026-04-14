// Copyright 2024 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import MempoolElectrumClient from '@mempool/electrum-client'

/**
 * JS method names on {@link MempoolElectrumClient} → Electrum JSON-RPC `method` string
 * (must match @mempool/electrum-client/index.js).
 */
const ELECTRUM_JS_TO_WIRE = {
  server_version: 'server.version',
  server_banner: 'server.banner',
  server_features: 'server.features',
  server_ping: 'server.ping',
  server_addPeer: 'server.add_peer',
  serverDonation_address: 'server.donation_address',
  serverPeers_subscribe: 'server.peers.subscribe',
  blockchainAddress_getProof: 'blockchain.address.get_proof',
  blockchainScripthash_getBalance: 'blockchain.scripthash.get_balance',
  blockchainScripthash_getHistory: 'blockchain.scripthash.get_history',
  blockchainScripthash_getMempool: 'blockchain.scripthash.get_mempool',
  blockchainScripthash_listunspent: 'blockchain.scripthash.listunspent',
  blockchainScripthash_subscribe: 'blockchain.scripthash.subscribe',
  blockchainBlock_getHeader: 'blockchain.block.get_header',
  blockchainBlock_headers: 'blockchain.block.headeres',
  blockchainEstimatefee: 'blockchain.estimatefee',
  blockchainHeaders_subscribe: 'blockchain.headers.subscribe',
  blockchain_relayfee: 'blockchain.relayfee',
  blockchainTransaction_broadcast: 'blockchain.transaction.broadcast',
  blockchainTransaction_get: 'blockchain.transaction.get',
  blockchainTransaction_getMerkle: 'blockchain.transaction.get_merkle',
  mempool_getFeeHistogram: 'mempool.get_fee_histogram',
  blockchainUtxo_getAddress: 'blockchain.utxo.get_address',
  blockchainNumblocks_subscribe: 'blockchain.numblocks.subscribe',
  blockchainBlock_getChunk: 'blockchain.block.get_chunk',
  blockchainAddress_getBalance: 'blockchain.address.get_balance',
  blockchainAddress_getHistory: 'blockchain.address.get_history',
  blockchainAddress_getMempool: 'blockchain.address.get_mempool',
  blockchainAddress_listunspent: 'blockchain.address.listunspent',
  blockchainAddress_subscribe: 'blockchain.address.subscribe'
}

/**
 * Builds the same newline-terminated payload(s) @mempool/electrum-client sends on the wire.
 *
 * @param {string} jsMethod
 * @param {unknown[]} args
 * @returns {string | null} Single JSON line, or JSON array line for batch calls; null if unmapped.
 */
function buildElectrumWirePayload (jsMethod, args) {
  if (jsMethod.endsWith('Batch')) {
    const baseJs = jsMethod.replace(/Batch$/, '')
    const wireMethod = ELECTRUM_JS_TO_WIRE[baseJs]
    const paramList = args[0]
    if (!wireMethod || !Array.isArray(paramList)) return null
    const secondParam = args[1]
    const parts = paramList.map((param, i) => {
      const id = i + 1
      const params = secondParam !== undefined ? [param, secondParam] : [param]
      return JSON.stringify({
        jsonrpc: '2.0',
        method: wireMethod,
        params,
        id
      })
    })
    return '[' + parts.join(',') + ']'
  }

  const wireMethod = ELECTRUM_JS_TO_WIRE[jsMethod]
  if (!wireMethod) return null

  return JSON.stringify({
    jsonrpc: '2.0',
    method: wireMethod,
    params: args,
    id: 1
  })
}

/**
 * @param {string} protocol
 * @param {string} host
 * @param {number} port
 * @param {string} payloadLine JSON line (or batch array) to send, then newline
 * @returns {string} Shell command (Electrum is TCP/TLS JSON-RPC, not HTTP — not replicable with curl alone)
 */
function formatElectrumReplicateShell (protocol, host, port, payloadLine) {
  const quoted = "'" + payloadLine.replace(/'/g, "'\"'\"'") + "'"
  if (protocol === 'tls' || protocol === 'ssl') {
    return `printf '%s\\n' ${quoted} | openssl s_client -quiet -connect ${host}:${port} 2>/dev/null`
  }
  return `printf '%s\\n' ${quoted} | nc -N ${host} ${port}`
}

/**
 * @typedef {Object} ElectrumConfig
 * @property {string} [client] - The name of the client reported to the server (default: 'wdk-wallet').
 * @property {string} [version] - The electrum protocol version (default: '1.4').
 */

/**
 * @typedef {Object} PersistencePolicy
 * @property {number} [maxRetry] - The maximum reconnection attempts before failing (default: 2).
 * @property {number} [retryPeriod] - The delay between reconnect attempts, in ms (default: 1_000).
 * @property {number} [pingPeriod] - The delay between keep-alive pings, in ms (default: 120_000).
 * @property {(err: Error | null) => void} [callback] - An optional status callback.
 */

/**
 * A thin wrapper around {@link @mempool/electrum-client} that lazily initializes the underlying
 * electrum connection on first rpc call.
 *
 * The instance returned from the constructor is a proxy that intercepts all method calls
 * except `close`, `initElectrum`, and `reconnect` and ensures the client is initialized.
 */
export default class ElectrumClient extends MempoolElectrumClient {
  /**
   * Create a new electrum client wrapper.
   *
   * @param {number} port - The electrum server's port.
   * @param {string} host - The electrum server's hostname.
   * @param {'tcp' | 'tls' | 'ssl'} protocol - The transport protocol to use.
   * @param {PersistencePolicy} [persistencePolicy] - The persistence policy.
   */
  constructor (port, host, protocol, persistencePolicy = { }) {
    super(port, host, protocol)

    /** @private Used by debug logs */
    this._rpcHost = host
    this._rpcPort = port
    this._rpcProtocol = protocol
    this._rpcEndpoint = `${protocol}://${host}:${port}`

    const { retryPeriod = 1_000, maxRetry = 2, pingPeriod = 120_000, callback = null } = persistencePolicy

    /**
     * @private
     * @type {ElectrumConfig}
     **/
    this._electrumConfig = {
      client: '@tetherto/wdk-wallet-btc',
      version: '1.4'
    }

    /**
     * @private
     * @type {PersistencePolicy}
     **/
    this._persistencePolicy = { retryPeriod, maxRetry, pingPeriod, callback }

    /**
     * @private
     * @type {Promise<void> | null}
     */
    this._ready = null

    const _this = this

    return new Proxy(this, {
      get (target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver)

        if (typeof value !== 'function') {
          return value
        }

        if (prop === 'close' || prop === 'initElectrum' || prop === 'reconnect') {
          return value.bind(target)
        }

        return async function (...args) {
          await _this._ensure()
          const method = String(prop)
          if (method !== 'server_ping') {
            const wirePayload = buildElectrumWirePayload(method, args)
            if (wirePayload != null) {
              const shell = formatElectrumReplicateShell(
                _this._rpcProtocol,
                _this._rpcHost,
                _this._rpcPort,
                wirePayload
              )
              console.log('[Electrum RPC] jsMethod:', method, '→', _this._rpcEndpoint)
              console.log('[Electrum RPC] wire (newline-terminated JSON-RPC, same as on the socket):')
              console.log(wirePayload)
              console.log(
                '[Electrum RPC] replicate (Electrum is not HTTP — use nc/openssl, not curl):'
              )
              console.log(shell)
            } else {
              console.log(
                '[Electrum RPC]',
                _this._rpcEndpoint,
                method,
                args.length ? JSON.stringify(args) : '[]',
                '(no wire map — see @mempool/electrum-client)'
              )
            }
          }
          return value.apply(target, args)
        }
      }
    })
  }

  /**
   * Ensures the electrum connection is initialized. If a previous attempt failed or the
   * client was closed, a new initialization is attempted.
   *
   * @private
   * @param {number} [timeout] - The timeout, in ms (default: 15_000).
   * @returns {Promise<void>}
   */
  _ensure (timeout = 15_000) {
    if (this._ready) {
      return this._ready
    }

    const initElectrum = super.initElectrum(this._electrumConfig, this._persistencePolicy)

    const timeoutTask = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Electrum client initialization time out.')), timeout)
      timer.unref()
    })

    this._ready = Promise.race([initElectrum, timeoutTask]).catch(error => {
      this._ready = null
      throw error
    })

    return this._ready
  }

  /**
   * Recreates the underlying socket and reinitializes the session.
   *
   * @returns {Promise<void>}
   */
  reconnect () {
    this.initSocket()

    const initElectrum = super.initElectrum(this._electrumConfig, this._persistencePolicy)

    this._ready = initElectrum.catch(error => {
      this._ready = null
      throw error
    })

    return this._ready
  }

  /**
   * Closes the connection.
   *
   * @returns {void}
   */
  close () {
    super.close()
    this._ready = null
    this.reconnect = ElectrumClient.prototype.reconnect.bind(this)
  }
}
