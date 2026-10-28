import { beforeEach, describe, expect, jest, test } from '@jest/globals'

import { BlockbookClient } from '../index.js'
import { NoSuchElementError, ProviderError, ProviderErrorReason } from '@tetherto/wdk-wallet'

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

    // tx1: unconfirmed deposit of 50,000, not trusted (no vin). tx2: spends that
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

    // tx1: unconfirmed deposit of 50,000, not trusted. tx2: spends a confirmed
    // 500,000 AND that same untrusted 50,000 together, keeps 40,000 change -
    // the confirmed 500,000 is still spent regardless, but since not every
    // input is trusted, none of tx2's own change counts yet.
    test('should not credit change from a tx that mixes a confirmed input with an untrusted one, even though the confirmed spend still counts', async () => {
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

      expect(balance.unconfirmedOutgoing).toBe(500000)
      expect(balance.confirmed - balance.unconfirmedOutgoing).toBe(0)
    })

    // tx1: spends confirmed 1,000,000, sends 300,000, keeps 700,000 change.
    // tx3: spends that same 700,000, sends 400,000, keeps 300,000 - tx3's
    // further spend must reduce the balance too, not just tx1's own portion.
    test('should subtract a further pending spend of a trusted change output instead of double-crediting it', async () => {
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
    test('should count both a direct confirmed input and a chained input from another trusted transaction', async () => {
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

    // t1: unconfirmed deposit, not trusted. t2 spends t1's output, t3 spends
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

    // A tx spends a confirmed 5,000 alongside an unconfirmed deposit from
    // elsewhere (10,000), keeping 9,000 change. Since not every input is
    // trusted, none of this tx's own change counts yet - only the confirmed
    // 5,000 it spent is reflected, dropping the balance to 0 until the whole
    // thing (including the deposit) actually confirms.
    test('should not credit any change from a tx that mixes confirmed money with an untrusted deposit', async () => {
      fetchMock.mockResolvedValueOnce(mockBlockbookAddress({
        balance: '5000',
        unconfirmedBalance: '4000',
        transactions: [
          {
            txid: 'dep',
            blockHeight: -1,
            vin: [{ isAddress: true, addresses: ['someone-else'], value: '10000', txid: 'prev-dep' }],
            vout: [{ isAddress: true, addresses: [ADDRESS], value: '10000', n: 0 }]
          },
          {
            txid: 'mixed',
            blockHeight: -1,
            vin: [
              { isAddress: true, addresses: [ADDRESS], value: '5000', txid: 'confirmed-A' },
              { isAddress: true, addresses: [ADDRESS], value: '10000', txid: 'dep', vout: 0 }
            ],
            vout: [
              { isAddress: true, addresses: [ADDRESS], value: '9000', n: 0 },
              { isAddress: true, addresses: ['ext'], value: '6000', n: 1 }
            ]
          }
        ]
      }))

      const balance = await client.getBalance(ADDRESS)

      expect(balance.unconfirmedOutgoing).toBe(5000)
      expect(balance.confirmed - balance.unconfirmedOutgoing).toBe(0)
    })

    // Same mixed tx as above, but alongside a second, unrelated fully-trusted
    // send (confirmed 100,000 -> 80,000 out, 20,000 change). Each transaction
    // must be counted independently - the untrusted mixed tx still only loses
    // its confirmed 5,000, while the separate trusted send is counted in full.
    test('should count a partially-untrusted tx and a separate fully-trusted tx independently', async () => {
      fetchMock.mockResolvedValueOnce(mockBlockbookAddress({
        balance: '105000',
        unconfirmedBalance: '84000',
        transactions: [
          {
            txid: 'dep',
            blockHeight: -1,
            vin: [{ isAddress: true, addresses: ['someone-else'], value: '10000', txid: 'prev-dep' }],
            vout: [{ isAddress: true, addresses: [ADDRESS], value: '10000', n: 0 }]
          },
          {
            txid: 'mixed',
            blockHeight: -1,
            vin: [
              { isAddress: true, addresses: [ADDRESS], value: '5000', txid: 'confirmed-A' },
              { isAddress: true, addresses: [ADDRESS], value: '10000', txid: 'dep', vout: 0 }
            ],
            vout: [
              { isAddress: true, addresses: [ADDRESS], value: '9000', n: 0 },
              { isAddress: true, addresses: ['ext'], value: '6000', n: 1 }
            ]
          },
          {
            txid: 'other',
            blockHeight: -1,
            vin: [{ isAddress: true, addresses: [ADDRESS], value: '100000', txid: 'confirmed-B' }],
            vout: [
              { isAddress: true, addresses: [ADDRESS], value: '20000', n: 0 },
              { isAddress: true, addresses: ['ext2'], value: '80000', n: 1 }
            ]
          }
        ]
      }))

      const balance = await client.getBalance(ADDRESS)

      expect(balance.unconfirmedOutgoing).toBe(85000)
      expect(balance.confirmed - balance.unconfirmedOutgoing).toBe(20000)
    })

    // A tx spends a confirmed 500,000 of ours AND an unrelated third party's
    // 200,000 input together, keeping 300,000 change. Even though our own
    // input is directly confirmed, the tx as a whole isn't trusted (it has an
    // input that was never ours at all) - so the confirmed 500,000 still
    // counts as spent, but none of the change is credited yet.
    test('should not trust a tx that mixes our confirmed input with an unrelated third party\'s input', async () => {
      fetchMock.mockResolvedValueOnce(mockBlockbookAddress({
        balance: '500000',
        unconfirmedBalance: '200000',
        transactions: [{
          txid: 'shared',
          blockHeight: -1,
          vin: [
            { isAddress: true, addresses: [ADDRESS], value: '500000', txid: 'confirmed-A' },
            { isAddress: true, addresses: ['someone-else'], value: '200000', txid: 'foreign-prev' }
          ],
          vout: [
            { isAddress: true, addresses: [ADDRESS], value: '300000', n: 0 },
            { isAddress: true, addresses: ['someone-else'], value: '400000', n: 1 }
          ]
        }]
      }))

      const balance = await client.getBalance(ADDRESS)

      expect(balance.unconfirmedOutgoing).toBe(500000)
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
      expect(rate).toBeCloseTo(25)
    })

    test('should fall back to mempool.space when Blockbook v1 fails', async () => {
      fetchMock
        .mockResolvedValueOnce(mockBlockbookFailure())
        .mockResolvedValueOnce(mockMempoolFees())

      const rate = await client.estimateFee(1)

      expect(fetchMock).toHaveBeenCalledWith('https://example.com/api/v1/estimatefee/1')
      expect(fetchMock).toHaveBeenCalledWith('https://mempool.space/api/v1/fees/recommended')
      expect(rate).toBe(MEMPOOL_FEES.fastestFee)
    })

    test('should fall back to mempool.space when Blockbook v1 returns negative rate', async () => {
      fetchMock
        .mockResolvedValueOnce(mockBlockbookFee(-1))
        .mockResolvedValueOnce(mockMempoolFees())

      const rate = await client.estimateFee(1)

      expect(rate).toBe(MEMPOOL_FEES.fastestFee)
    })

    test('should map mempool.space fastestFee for 1 block target', async () => {
      fetchMock
        .mockResolvedValueOnce(mockBlockbookFailure())
        .mockResolvedValueOnce(mockMempoolFees())

      const rate = await client.estimateFee(1)

      expect(rate).toBe(MEMPOOL_FEES.fastestFee)
    })

    test('should map mempool.space halfHourFee for 2-3 block target', async () => {
      fetchMock
        .mockResolvedValueOnce(mockBlockbookFailure())
        .mockResolvedValueOnce(mockMempoolFees())

      const rate = await client.estimateFee(3)

      expect(rate).toBe(MEMPOOL_FEES.halfHourFee)
    })

    test('should map mempool.space hourFee for 4-6 block target', async () => {
      fetchMock
        .mockResolvedValueOnce(mockBlockbookFailure())
        .mockResolvedValueOnce(mockMempoolFees())

      const rate = await client.estimateFee(6)

      expect(rate).toBe(MEMPOOL_FEES.hourFee)
    })

    test('should map mempool.space economyFee for >6 block target', async () => {
      fetchMock
        .mockResolvedValueOnce(mockBlockbookFailure())
        .mockResolvedValueOnce(mockMempoolFees())

      const rate = await client.estimateFee(25)

      expect(rate).toBe(MEMPOOL_FEES.economyFee)
    })

    test('should return mempool.space sat/vB as is', async () => {
      fetchMock
        .mockResolvedValueOnce(mockBlockbookFailure())
        .mockResolvedValueOnce(mockMempoolFees({ fastestFee: 100, halfHourFee: 50, hourFee: 25, economyFee: 10 }))

      const rate = await client.estimateFee(1)

      expect(rate).toBe(100)
    })

    test('should throw when both sources fail', async () => {
      fetchMock
        .mockResolvedValueOnce(mockBlockbookFailure())
        .mockResolvedValueOnce({ ok: false })

      const promise = client.estimateFee(1)

      await expect(promise).rejects.toThrow(ProviderError)
      await expect(promise).rejects.toThrow('Fee estimation request failed')
      await expect(promise).rejects.toMatchObject({ reason: ProviderErrorReason.NETWORK_ERROR })
    })

    test('should throw when mempool.space reports no usable fee', async () => {
      fetchMock
        .mockResolvedValueOnce(mockBlockbookFailure())
        .mockResolvedValueOnce(mockMempoolFees({ fastestFee: 0, halfHourFee: 0, hourFee: 0, economyFee: 0 }))

      const promise = client.estimateFee(1)

      await expect(promise).rejects.toThrow(ProviderError)
      await expect(promise).rejects.toThrow('Fee estimation is unavailable')
      await expect(promise).rejects.toMatchObject({ reason: ProviderErrorReason.INTERNAL_SERVER_ERROR })
    })
  })

  describe('request failures', () => {
    function mockFailure (status, statusText) {
      return {
        ok: false,
        status,
        statusText,
        text: jest.fn().mockResolvedValue('boom')
      }
    }

    test('should throw a provider error when the backend responds with an error status', async () => {
      fetchMock.mockResolvedValueOnce(mockFailure(503, 'Service Unavailable'))

      const promise = client.getBlockHeight()

      await expect(promise).rejects.toThrow(ProviderError)
      await expect(promise).rejects.toThrow('Blockbook request failed: 503 Service Unavailable – boom')
      await expect(promise).rejects.toMatchObject({ reason: ProviderErrorReason.INTERNAL_SERVER_ERROR })
    })

    test('should map an unauthorized response to the matching reason', async () => {
      fetchMock.mockResolvedValueOnce(mockFailure(401, 'Unauthorized'))

      await expect(client.getBlockHeight())
        .rejects.toMatchObject({ reason: ProviderErrorReason.UNAUTHORIZED })
    })

    test('should throw when the backend returns no raw transaction', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue({}) })

      const promise = client.getTransaction('MOCK_TXID')

      await expect(promise).rejects.toThrow(NoSuchElementError)
      await expect(promise).rejects.toThrow('Transaction MOCK_TXID has no hex data')
    })

    test('should throw when the backend rejects a broadcast', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ error: 'bad-txns-inputs-missingorspent' })
      })

      const promise = client.broadcast('deadbeef')

      await expect(promise).rejects.toThrow(ProviderError)
      await expect(promise).rejects.toThrow('bad-txns-inputs-missingorspent')
      await expect(promise).rejects.toMatchObject({ reason: ProviderErrorReason.INTERNAL_SERVER_ERROR })
    })
  })
})
