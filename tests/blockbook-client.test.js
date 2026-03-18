import { afterEach, describe, expect, jest, test } from '@jest/globals'

import { BlockbookClient } from '../index.js'

const MEMPOOL_FEES = {
  fastestFee: 50,
  halfHourFee: 30,
  hourFee: 15,
  economyFee: 5
}

describe('BlockbookClient', () => {
  let client
  let originalFetch

  afterEach(() => {
    if (originalFetch) {
      global.fetch = originalFetch
      originalFetch = undefined
    }
  })

  describe('estimateFee', () => {
    function mockMempoolFees (fees = MEMPOOL_FEES) {
      originalFetch = global.fetch
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(fees)
      })

      client = new BlockbookClient({ url: 'https://example.com/api' })
    }

    test('should return fastestFee for 1 block target', async () => {
      mockMempoolFees()

      const rate = await client.estimateFee(1)

      expect(rate).toBe(MEMPOOL_FEES.fastestFee / 100_000)
    })

    test('should return halfHourFee for 2-3 block target', async () => {
      mockMempoolFees()

      const rate = await client.estimateFee(3)

      expect(rate).toBe(MEMPOOL_FEES.halfHourFee / 100_000)
    })

    test('should return hourFee for 4-6 block target', async () => {
      mockMempoolFees()

      const rate = await client.estimateFee(6)

      expect(rate).toBe(MEMPOOL_FEES.hourFee / 100_000)
    })

    test('should return economyFee for >6 block target', async () => {
      mockMempoolFees()

      const rate = await client.estimateFee(25)

      expect(rate).toBe(MEMPOOL_FEES.economyFee / 100_000)
    })

    test('should return BTC/kB format (sat/vB divided by 100_000)', async () => {
      mockMempoolFees({ fastestFee: 100, halfHourFee: 50, hourFee: 25, economyFee: 10 })

      const rate = await client.estimateFee(1)

      expect(rate).toBe(0.001)
    })

    test('should return -1 when fetch fails', async () => {
      originalFetch = global.fetch
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'))
      client = new BlockbookClient({ url: 'https://example.com/api' })

      const rate = await client.estimateFee(1)

      expect(rate).toBe(-1)
    })

    test('should return -1 when response is not ok', async () => {
      originalFetch = global.fetch
      global.fetch = jest.fn().mockResolvedValue({ ok: false })
      client = new BlockbookClient({ url: 'https://example.com/api' })

      const rate = await client.estimateFee(1)

      expect(rate).toBe(-1)
    })
  })
})
