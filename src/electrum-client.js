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

import BaseElectrumClient from '@mempool/electrum-client'

export default class ElectrumClient extends BaseElectrumClient {
  constructor (
    port,
    host,
    protocol,
    {
      client = 'wdk-wallet',
      version = '1.4',
      persistence = { retryPeriod: 1000, maxRetry: 2, pingPeriod: 120000, callback: null },
      options,
      callbacks
    } = {}
  ) {
    super(port, host, protocol, options, callbacks)

    this._clientInfo = { client, version }
    this._persistence = persistence

    this._ready = super.initElectrum(this._clientInfo, this._persistence)
      .catch(err => { this._ready = null; throw err })

    const target = this
    return new Proxy(this, {
      get (obj, prop, receiver) {
        const value = Reflect.get(obj, prop, receiver)
        if (typeof value !== 'function') return value

        if (prop === 'close' || prop === 'initElectrum' || prop === 'reconnect') {
          return value.bind(obj)
        }

        return async function (...args) {
          await target._ready
          return value.apply(obj, args)
        }
      }
    })
  }

  _ensure (timeoutMs = 15000) {
    if (this._ready) return this._ready

    const initPromise = super.initElectrum(this._clientInfo, this._persistence)
    const timeoutPromise = new Promise((_resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Electrum init timeout')), timeoutMs)
      if (typeof t.unref === 'function') t.unref()
    })

    this._ready = Promise.race([initPromise, timeoutPromise]).catch(err => {
      this._ready = null
      throw err
    })

    return this._ready
  }

  reconnect () {
    this.initSocket()
    const p = super.initElectrum(this._clientInfo, this._persistence)
    this._ready = p.catch(err => { this._ready = null; throw err })
    return this._ready
  }

  close () {
    super.close()
    this._ready = null
    this.reconnect = ElectrumClient.prototype.reconnect.bind(this)
  }
}
