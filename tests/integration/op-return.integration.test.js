// Integration test for OP_RETURN memo on a regtest node.
//
// Place at: tests/integration/op-return.integration.test.js in the
// wdk-wallet-btc repo. Run with: npm run test:integration.
//
// Requires a regtest Bitcoin Core node + Electrs (or equivalent
// Electrum-protocol server) wired into the existing integration
// harness. Mirrors the existing transfer / sendTransaction integration
// tests' setup pattern; consult repo conventions for the harness API.

import WalletManagerBtc from '../../index.js'

const REGTEST_MNEMONIC = process.env.REGTEST_MNEMONIC ||
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const REGTEST_ELECTRUM_HOST = process.env.REGTEST_ELECTRUM_HOST || '127.0.0.1'
const REGTEST_ELECTRUM_PORT = Number(process.env.REGTEST_ELECTRUM_PORT || 60_001)

const REGTEST_CONFIG = {
  network: 'regtest',
  client: {
    type: 'electrum',
    clientConfig: { host: REGTEST_ELECTRUM_HOST, port: REGTEST_ELECTRUM_PORT }
  }
}

describe('sendTransaction with OP_RETURN memo (regtest)', () => {
  let wallet
  let account

  beforeAll(async () => {
    wallet = new WalletManagerBtc({
      seed: REGTEST_MNEMONIC,
      ...REGTEST_CONFIG
    })
    account = await wallet.getAccount(0)
    // The existing integration harness funds this address via
    // `generatetoaddress`. Skip this test if the address is empty.
    const balance = await account.getBalance()
    if (balance.confirmed === 0n) {
      throw new Error('Regtest address is unfunded — fund via generatetoaddress before running')
    }
  })

  afterAll(async () => {
    await account?.dispose?.()
    await wallet?.dispose?.()
  })

  test('emits an OP_RETURN output carrying the memo bytes', async () => {
    const memo = '=:e:0xabcdef:1234:commission/SDK:444/5'
    const recipient = await (await wallet.getAccount(1)).getAddress()

    const { hash } = await account.sendTransaction({
      to: recipient,
      value: 100_000n,
      feeRate: 5n,
      memo
    })

    // Wait for the tx to be observable, then decode it.
    const receipt = await new Promise((resolve, reject) => {
      const deadline = Date.now() + 30_000
      const poll = async () => {
        const r = await account.getTransactionReceipt(hash).catch(() => null)
        if (r) return resolve(r)
        if (Date.now() > deadline) return reject(new Error('Timed out'))
        setTimeout(poll, 500)
      }
      poll()
    })

    const opReturn = receipt.outs.find(o => o.script[0] === 0x6a)
    expect(opReturn).toBeDefined()
    expect(opReturn.value).toBe(0)
    const dataOffset = opReturn.script[1] === 0x4c ? 3 : 2
    expect(opReturn.script.slice(dataOffset).toString('utf8')).toBe(memo)
  })

  test('rejects memos above the 80-byte standardness cap', async () => {
    const recipient = await (await wallet.getAccount(1)).getAddress()
    await expect(account.sendTransaction({
      to: recipient,
      value: 100_000n,
      feeRate: 5n,
      memo: 'x'.repeat(81)
    })).rejects.toThrow(RangeError)
  })
})
