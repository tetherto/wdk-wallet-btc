import WalletManagerBtc from '../../src/wallet-manager-btc.js'
import { execSync } from 'child_process'

describe('Integration: WalletManagerBtc + Electrum', () => {
  const seed = WalletManagerBtc.getRandomSeedPhrase()
  const config = {
    host: '127.0.0.1',
    port: 50001,
    network: 'regtest'
  }

  let wallet, account0, account1, addr0, addr1

  beforeAll(async () => {
    wallet = new WalletManagerBtc(seed, config)
    account0 = await wallet.getAccount(0)
    account1 = await wallet.getAccount(1)

    addr0 = await account0.getAddress()
    addr1 = await account1.getAddress()

    console.log('[ADDR 0]', addr0)
    console.log('[ADDR 0 pubkey]', account0.keyPair.publicKey)

    // Fund account0
    execSync(`bitcoin-cli -regtest -datadir=$HOME/.bitcoin generatetoaddress 101 ${addr0}`)
    await new Promise(resolve => setTimeout(resolve, 3000))
  })

  test('account 0 has incoming transfer in history', async () => {
    const transfers = await account0.getTransfers()
    console.log('[account0 transfers]', transfers)
    expect(transfers.length).toBeGreaterThan(0)
    expect(transfers.some(t => t.direction === 'incoming')).toBe(true)
  })

  test('can send transaction from account 0 to account 1', async () => {
    console.log('[ADDR 1]', addr1)

    const txid = await account0.sendTransaction({
      to: addr1,
      value: 10_000
    })

    console.log('[txid]', txid)

    execSync(`bitcoin-cli -regtest -datadir=$HOME/.bitcoin generate 1`)
    await new Promise(resolve => setTimeout(resolve, 2000))

    const transfers = await account0.getTransfers()
    console.log('[post-send transfers]', transfers)

    const sent = transfers.find(t => t.txid === txid)
    expect(sent).toBeDefined()
    expect(sent.direction).toBe('outgoing')
    expect(sent.value).toBe(10_000)
  })
})
