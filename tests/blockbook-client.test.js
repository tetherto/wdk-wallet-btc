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

  describe('estimateFee', () => {
    const MEMPOOL_FEES = {
      fastestFee: 50,
      halfHourFee: 30,
      hourFee: 15,
      economyFee: 5
    }

    function mockMempoolFees (fees = MEMPOOL_FEES) {
      fetchMock.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(fees)
      })
    }

    test('should return fastestFee for 1 block target', async () => {
      mockMempoolFees()

      const rate = await client.estimateFee(1)

      expect(fetchMock).toHaveBeenCalledWith('https://mempool.space/api/v1/fees/recommended')
      expect(rate).toBe(MEMPOOL_FEES.fastestFee / 100_000)
    })

    test('should return halfHourFee for 2-3 block target', async () => {
      mockMempoolFees()

      const rate = await client.estimateFee(3)

      expect(fetchMock).toHaveBeenCalledWith('https://mempool.space/api/v1/fees/recommended')
      expect(rate).toBe(MEMPOOL_FEES.halfHourFee / 100_000)
    })

    test('should return hourFee for 4-6 block target', async () => {
      mockMempoolFees()

      const rate = await client.estimateFee(6)

      expect(fetchMock).toHaveBeenCalledWith('https://mempool.space/api/v1/fees/recommended')
      expect(rate).toBe(MEMPOOL_FEES.hourFee / 100_000)
    })

    test('should return economyFee for >6 block target', async () => {
      mockMempoolFees()

      const rate = await client.estimateFee(25)

      expect(fetchMock).toHaveBeenCalledWith('https://mempool.space/api/v1/fees/recommended')
      expect(rate).toBe(MEMPOOL_FEES.economyFee / 100_000)
    })

    test('should return BTC/kB format (sat/vB divided by 100_000)', async () => {
      mockMempoolFees({ fastestFee: 100, halfHourFee: 50, hourFee: 25, economyFee: 10 })

      const rate = await client.estimateFee(1)

      expect(rate).toBe(0.001)
    })

    test('should return -1 when fetch fails', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'))

      const rate = await client.estimateFee(1)

      expect(rate).toBe(-1)
    })

    test('should return -1 when response is not ok', async () => {
      fetchMock.mockResolvedValue({ ok: false })

      const rate = await client.estimateFee(1)

      expect(rate).toBe(-1)
    })
  })
})
