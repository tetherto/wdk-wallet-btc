import { describe, expect, test } from '@jest/globals'

import { IBtcClient } from '../index.js'
import { NotImplementedError } from '@tetherto/wdk-wallet'

describe('IBtcClient', () => {
  const client = new IBtcClient()

  test('should throw a not implemented error from listUnspent', async () => {
    const promise = client.listUnspent('address')

    await expect(promise).rejects.toThrow(NotImplementedError)
    await expect(promise).rejects.toThrow('listUnspent(address, opts)')
  })

  test('should throw a not implemented error from listSpendable', async () => {
    const promise = client.listSpendable('address')

    await expect(promise).rejects.toThrow(NotImplementedError)
    await expect(promise).rejects.toThrow('listSpendable(address)')
  })
})
