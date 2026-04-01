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
