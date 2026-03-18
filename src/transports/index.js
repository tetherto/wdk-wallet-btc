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
'use strict'

/** @typedef {import('./btc-client.js').BtcClientConfig} BtcClientConfig */
/** @typedef {import('./btc-client.js').BtcBalance} BtcBalance */
/** @typedef {import('./btc-client.js').BtcUtxo} BtcUtxo */
/** @typedef {import('./btc-client.js').BtcHistoryItem} BtcHistoryItem */
/** @typedef {import('./mempool-electrum-client.js').MempoolElectrumConfig} MempoolElectrumConfig */

export { default as IBtcClient } from './btc-client.js'
export { default as MempoolElectrumClient } from './mempool-electrum-client.js'

export { default as ElectrumTcp } from './tcp.js'
export { default as ElectrumTls } from './tls.js'
export { default as ElectrumSsl } from './ssl.js'
export { default as ElectrumWs } from './ws.js'
