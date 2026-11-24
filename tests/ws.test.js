import { beforeEach, describe, expect, jest, test } from '@jest/globals'

import { ElectrumWs } from '../index.js'

describe('ElectrumWs listUnspent and listSpendable', () => {
  let client

  const stubUnspent = (items) => {
    client._request = jest.fn().mockResolvedValue(items)
  }

  beforeEach(() => {
    client = new ElectrumWs({ url: 'wss://electrum.example.com', network: 'regtest' })
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
