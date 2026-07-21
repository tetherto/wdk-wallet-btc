import { beforeEach, describe, expect, jest, test } from '@jest/globals'

import { BlockbookClient } from '../index.js'

const fetchMock = jest.fn()

global.fetch = fetchMock

describe('BlockbookClient', () => {
  let client

  beforeEach(() => {
    fetchMock.mockReset()
    client = new BlockbookClient({ url: 'https://example.com/api' })
  })

  describe('getBalance', () => {
    const ADDRESS = 'MOCK_ADDRESS'

    function mockBlockbookAddress (data) {
      return {
        ok: true,
        json: jest.fn().mockResolvedValue(data)
      }
    }

    test('should return the confirmed balance with no outgoing when there are no pending transactions', async () => {
      fetchMock.mockResolvedValueOnce(mockBlockbookAddress({
        balance: '100000',
        unconfirmedBalance: '0',
        transactions: []
      }))

      const balance = await client.getBalance(ADDRESS)

      expect(fetchMock).toHaveBeenCalledWith(`https://example.com/api/v2/address/${ADDRESS}?details=txs`)
      expect(balance).toEqual({ confirmed: 100000, unconfirmed: 0, unconfirmedOutgoing: 0 })
    })

    // tx1 only has the address in vout (no vin) - a pure receive, never counted per policy.
    test('should not count a pending incoming transaction as outgoing', async () => {
      fetchMock.mockResolvedValueOnce(mockBlockbookAddress({
        balance: '100000',
        unconfirmedBalance: '50000',
        transactions: [{
          txid: 'tx1',
          blockHeight: -1,
          vin: [{ isAddress: true, addresses: ['ANOTHER_MOCK_ADDRESS'], value: '50000', txid: 'prev-confirmed-tx' }],
          vout: [{ isAddress: true, addresses: [ADDRESS], value: '50000' }]
        }]
      }))

      const balance = await client.getBalance(ADDRESS)

      expect(balance.unconfirmedOutgoing).toBe(0)
    })

    test('should compute the outgoing amount for a pending send with change back to the same address', async () => {
      fetchMock.mockResolvedValueOnce(mockBlockbookAddress({
        balance: '100000',
        unconfirmedBalance: '-45000',
        transactions: [{
          txid: 'tx1',
          blockHeight: -1,
          vin: [{ isAddress: true, addresses: [ADDRESS], value: '50000', txid: 'prev-confirmed-tx' }],
          vout: [
            { isAddress: true, addresses: [ADDRESS], value: '5000' },
            { isAddress: true, addresses: ['MOCK_RECIPIENT'], value: '44000' }
          ]
        }]
      }))

      const balance = await client.getBalance(ADDRESS)

      expect(balance.unconfirmedOutgoing).toBe(45000)
    })

    // tx1: unrelated pending deposit of 200,000 (ignored). tx2: spends a confirmed
    // 150,000, sends 144,000, keeps 5,000 change - the two are independent, so
    // only tx2's spend should count.
    test('should only count the outgoing side when a pending receive and a pending send happen together', async () => {
      fetchMock.mockResolvedValueOnce(mockBlockbookAddress({
        balance: '100000',
        unconfirmedBalance: '55000',
        transactions: [
          {
            txid: 'tx1',
            blockHeight: -1,
            vin: [{ isAddress: true, addresses: ['someone-else'], value: '200000', txid: 'prev-someone-else-tx' }],
            vout: [{ isAddress: true, addresses: [ADDRESS], value: '200000' }]
          },
          {
            txid: 'tx2',
            blockHeight: -1,
            vin: [{ isAddress: true, addresses: [ADDRESS], value: '150000', txid: 'prev-confirmed-tx' }],
            vout: [
              { isAddress: true, addresses: [ADDRESS], value: '5000' },
              { isAddress: true, addresses: ['recipient'], value: '144000' }
            ]
          }
        ]
      }))

      const balance = await client.getBalance(ADDRESS)

      expect(balance.unconfirmedOutgoing).toBe(145000)
    })

    // tx1: unconfirmed deposit of 50,000, not rooted (no vin). tx2: spends that
    // same still-unconfirmed 50,000, sends 20,000, keeps 29,000 - since nothing
    // here ever touched confirmed money, the whole chain must net to zero rather
    // than going negative.
    test('should not go negative when a pending send spends the address\'s own pending receive (0-conf chaining)', async () => {
      fetchMock.mockResolvedValueOnce(mockBlockbookAddress({
        balance: '0',
        unconfirmedBalance: '9000',
        transactions: [
          {
            txid: 'tx1',
            blockHeight: -1,
            vin: [{ isAddress: true, addresses: ['someone-else'], value: '50000', txid: 'prev-someone-else-tx' }],
            vout: [{ isAddress: true, addresses: [ADDRESS], value: '50000' }]
          },
          {
            txid: 'tx2',
            blockHeight: -1,
            vin: [{ isAddress: true, addresses: [ADDRESS], value: '50000', txid: 'tx1' }],
            vout: [
              { isAddress: true, addresses: [ADDRESS], value: '29000' },
              { isAddress: true, addresses: ['recipient'], value: '20000' }
            ]
          }
        ]
      }))

      const balance = await client.getBalance(ADDRESS)

      expect(balance.unconfirmedOutgoing).toBe(0)
      expect(balance.confirmed - balance.unconfirmedOutgoing).toBe(0)
    })

    // tx1: unconfirmed deposit of 50,000, not rooted. tx2: spends a confirmed
    // 500,000 AND that same unrooted 50,000 together, keeps 40,000 change -
    // only the confirmed 500,000 side should count as real outgoing.
    test('should only count the confirmed-sourced input when a pending send mixes a confirmed and a chained input', async () => {
      fetchMock.mockResolvedValueOnce(mockBlockbookAddress({
        balance: '500000',
        unconfirmedBalance: '460000',
        transactions: [
          {
            txid: 'tx1',
            blockHeight: -1,
            vin: [{ isAddress: true, addresses: ['someone-else'], value: '50000', txid: 'prev-someone-else-tx' }],
            vout: [{ isAddress: true, addresses: [ADDRESS], value: '50000' }]
          },
          {
            txid: 'tx2',
            blockHeight: -1,
            vin: [
              { isAddress: true, addresses: [ADDRESS], value: '500000', txid: 'prev-confirmed-tx' },
              { isAddress: true, addresses: [ADDRESS], value: '50000', txid: 'tx1' }
            ],
            vout: [
              { isAddress: true, addresses: [ADDRESS], value: '40000' },
              { isAddress: true, addresses: ['recipient'], value: '510000' }
            ]
          }
        ]
      }))

      const balance = await client.getBalance(ADDRESS)

      expect(balance.unconfirmedOutgoing).toBe(460000)
    })

    // tx1: spends confirmed 1,000,000, sends 300,000, keeps 700,000 change.
    // tx3: spends that same 700,000, sends 400,000, keeps 300,000 - tx3's
    // further spend must reduce the balance too, not just tx1's own portion.
    test('should subtract a further pending spend of a rooted change output instead of double-crediting it', async () => {
      fetchMock.mockResolvedValueOnce(mockBlockbookAddress({
        balance: '1000000',
        unconfirmedBalance: '-700000',
        transactions: [
          {
            txid: 'tx1',
            blockHeight: -1,
            vin: [{ isAddress: true, addresses: [ADDRESS], value: '1000000', txid: 'prev-confirmed-tx' }],
            vout: [
              { isAddress: true, addresses: [ADDRESS], value: '700000', n: 0 },
              { isAddress: true, addresses: ['recipient1'], value: '300000', n: 1 }
            ]
          },
          {
            txid: 'tx3',
            blockHeight: -1,
            vin: [{ isAddress: true, addresses: [ADDRESS], value: '700000', txid: 'tx1', vout: 0 }],
            vout: [
              { isAddress: true, addresses: ['recipient2'], value: '400000', n: 0 },
              { isAddress: true, addresses: [ADDRESS], value: '300000', n: 1 }
            ]
          }
        ]
      }))

      const balance = await client.getBalance(ADDRESS)

      expect(balance.unconfirmedOutgoing).toBe(700000)
      expect(balance.confirmed - balance.unconfirmedOutgoing).toBe(300000)
    })

    // tx1: spends confirmed 300,000, keeps 200,000 change. tx4: spends a
    // separate confirmed 500,000 AND tx1's 200,000 change together, keeps
    // 150,000 - both inputs are real, so both should count.
    test('should count both a direct confirmed input and a chained input from another rooted transaction', async () => {
      fetchMock.mockResolvedValueOnce(mockBlockbookAddress({
        balance: '800000',
        unconfirmedBalance: '-650000',
        transactions: [
          {
            txid: 'tx1',
            blockHeight: -1,
            vin: [{ isAddress: true, addresses: [ADDRESS], value: '300000', txid: 'confirmed-A' }],
            vout: [
              { isAddress: true, addresses: [ADDRESS], value: '200000', n: 0 },
              { isAddress: true, addresses: ['recipient1'], value: '100000', n: 1 }
            ]
          },
          {
            txid: 'tx4',
            blockHeight: -1,
            vin: [
              { isAddress: true, addresses: [ADDRESS], value: '500000', txid: 'confirmed-B' },
              { isAddress: true, addresses: [ADDRESS], value: '200000', txid: 'tx1', vout: 0 }
            ],
            vout: [
              { isAddress: true, addresses: [ADDRESS], value: '150000', n: 0 },
              { isAddress: true, addresses: ['recipient2'], value: '550000', n: 1 }
            ]
          }
        ]
      }))

      const balance = await client.getBalance(ADDRESS)

      expect(balance.unconfirmedOutgoing).toBe(650000)
      expect(balance.confirmed - balance.unconfirmedOutgoing).toBe(150000)
    })

    // t1: unconfirmed deposit, not rooted. t2 spends t1's output, t3 spends
    // t2's output - the whole 3-hop chain never touches confirmed money, so
    // it must net to zero however many hops deep it goes.
    test('should ignore a multi-hop chain of pending transactions that never touches confirmed money', async () => {
      fetchMock.mockResolvedValueOnce(mockBlockbookAddress({
        balance: '0',
        unconfirmedBalance: '100000',
        transactions: [
          {
            txid: 't1',
            blockHeight: -1,
            vin: [{ isAddress: true, addresses: ['someone-else'], value: '500000', txid: 'prev-someone-else-tx' }],
            vout: [{ isAddress: true, addresses: [ADDRESS], value: '500000', n: 0 }]
          },
          {
            txid: 't2',
            blockHeight: -1,
            vin: [{ isAddress: true, addresses: [ADDRESS], value: '500000', txid: 't1', vout: 0 }],
            vout: [
              { isAddress: true, addresses: [ADDRESS], value: '300000', n: 0 },
              { isAddress: true, addresses: ['recipientA'], value: '200000', n: 1 }
            ]
          },
          {
            txid: 't3',
            blockHeight: -1,
            vin: [{ isAddress: true, addresses: [ADDRESS], value: '300000', txid: 't2', vout: 0 }],
            vout: [
              { isAddress: true, addresses: [ADDRESS], value: '100000', n: 0 },
              { isAddress: true, addresses: ['recipientB'], value: '200000', n: 1 }
            ]
          }
        ]
      }))

      const balance = await client.getBalance(ADDRESS)

      expect(balance.unconfirmedOutgoing).toBe(0)
      expect(balance.confirmed - balance.unconfirmedOutgoing).toBe(0)
    })

    test('should ignore confirmed transactions when computing the outgoing amount', async () => {
      fetchMock.mockResolvedValueOnce(mockBlockbookAddress({
        balance: '100000',
        unconfirmedBalance: '0',
        transactions: [{
          blockHeight: 800000,
          vin: [{ isAddress: true, addresses: [ADDRESS], value: '50000' }],
          vout: [{ isAddress: true, addresses: ['recipient'], value: '49000' }]
        }]
      }))

      const balance = await client.getBalance(ADDRESS)

      expect(balance.unconfirmedOutgoing).toBe(0)
    })

    test('should default to no outgoing when the transactions field is missing', async () => {
      fetchMock.mockResolvedValueOnce(mockBlockbookAddress({
        balance: '100000',
        unconfirmedBalance: '0'
      }))

      const balance = await client.getBalance(ADDRESS)

      expect(balance.unconfirmedOutgoing).toBe(0)
    })
  })

  describe('estimateFee', () => {
    const MEMPOOL_FEES = {
      fastestFee: 50,
      halfHourFee: 30,
      hourFee: 15,
      economyFee: 5
    }

    function mockBlockbookFee (result) {
      return {
        ok: true,
        json: jest.fn().mockResolvedValue({ result }),
        text: jest.fn().mockResolvedValue('')
      }
    }

    function mockBlockbookFailure () {
      return {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: jest.fn().mockResolvedValue('error')
      }
    }

    function mockMempoolFees (fees = MEMPOOL_FEES) {
      return {
        ok: true,
        json: jest.fn().mockResolvedValue(fees)
      }
    }

    test('should use Blockbook v1 when available', async () => {
      fetchMock.mockResolvedValue(mockBlockbookFee(0.00025))

      const rate = await client.estimateFee(6)

      expect(fetchMock).toHaveBeenCalledWith('https://example.com/api/v1/estimatefee/6')
      expect(rate).toBe(0.00025)
    })

    test('should fall back to mempool.space when Blockbook v1 fails', async () => {
      fetchMock
        .mockResolvedValueOnce(mockBlockbookFailure())
        .mockResolvedValueOnce(mockMempoolFees())

      const rate = await client.estimateFee(1)

      expect(fetchMock).toHaveBeenCalledWith('https://example.com/api/v1/estimatefee/1')
      expect(fetchMock).toHaveBeenCalledWith('https://mempool.space/api/v1/fees/recommended')
      expect(rate).toBe(MEMPOOL_FEES.fastestFee / 100_000)
    })

    test('should fall back to mempool.space when Blockbook v1 returns negative rate', async () => {
      fetchMock
        .mockResolvedValueOnce(mockBlockbookFee(-1))
        .mockResolvedValueOnce(mockMempoolFees())

      const rate = await client.estimateFee(1)

      expect(rate).toBe(MEMPOOL_FEES.fastestFee / 100_000)
    })

    test('should map mempool.space fastestFee for 1 block target', async () => {
      fetchMock
        .mockResolvedValueOnce(mockBlockbookFailure())
        .mockResolvedValueOnce(mockMempoolFees())

      const rate = await client.estimateFee(1)

      expect(rate).toBe(MEMPOOL_FEES.fastestFee / 100_000)
    })

    test('should map mempool.space halfHourFee for 2-3 block target', async () => {
      fetchMock
        .mockResolvedValueOnce(mockBlockbookFailure())
        .mockResolvedValueOnce(mockMempoolFees())

      const rate = await client.estimateFee(3)

      expect(rate).toBe(MEMPOOL_FEES.halfHourFee / 100_000)
    })

    test('should map mempool.space hourFee for 4-6 block target', async () => {
      fetchMock
        .mockResolvedValueOnce(mockBlockbookFailure())
        .mockResolvedValueOnce(mockMempoolFees())

      const rate = await client.estimateFee(6)

      expect(rate).toBe(MEMPOOL_FEES.hourFee / 100_000)
    })

    test('should map mempool.space economyFee for >6 block target', async () => {
      fetchMock
        .mockResolvedValueOnce(mockBlockbookFailure())
        .mockResolvedValueOnce(mockMempoolFees())

      const rate = await client.estimateFee(25)

      expect(rate).toBe(MEMPOOL_FEES.economyFee / 100_000)
    })

    test('should convert mempool.space sat/vB to BTC/kB', async () => {
      fetchMock
        .mockResolvedValueOnce(mockBlockbookFailure())
        .mockResolvedValueOnce(mockMempoolFees({ fastestFee: 100, halfHourFee: 50, hourFee: 25, economyFee: 10 }))

      const rate = await client.estimateFee(1)

      expect(rate).toBe(0.001)
    })

    test('should throw when both sources fail', async () => {
      fetchMock
        .mockResolvedValueOnce(mockBlockbookFailure())
        .mockResolvedValueOnce({ ok: false })

      await expect(client.estimateFee(1)).rejects.toThrow('Fee estimation request failed')
    })
  })
})
