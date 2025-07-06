import 'dotenv/config'
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals'
import { mnemonicToSeedSync } from 'bip39'
import { execSync } from 'child_process'

import WalletAccountBtc from '../src/wallet-account-btc.js'

const SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'
const INVALID_SEED_PHRASE = 'this is not valid mnemonic'
const SEED = mnemonicToSeedSync(SEED_PHRASE)
const ACCOUNT = {
  index: 0,
  path: "m/84'/0'/0'/0/0",
  address: 'bcrt1qxn0te9ecv864wtu53cccjhuuy5dphvemjt58ge',
  keyPair: {
    privateKey: '433c8e1e0064cdafe991f1efb4803d7dfcc2533db7d5cfa963ed53917b720248',
    publicKey: '035a48902f37c03901f36fea0a06aef2be29d9c55da559f5bd02c2d02d2b516382'
  }
}
const RELATIVE_PATH = ACCOUNT.path.replace(/^m\/84'\/0'\//, '')
const DATA_DIR = process.env.TEST_BITCOIN_CLI_DATA_DIR || `${process.env.HOME}/.bitcoin`
const CONFIG = {
  host: process.env.TEST_ELECTRUM_SERVER_HOST || '127.0.0.1',
  port: Number(process.env.TEST_ELECTRUM_SERVER_PORT || 7777),
  network: 'regtest'
}

class BitcoinCli {
  constructor (dataDir, walletName = 'testwallet') {
    this.base = `bitcoin-cli -regtest -datadir=${dataDir} -rpcwallet=${walletName}`
  }

  call (cmd) {
    return execSync(`${this.base} ${cmd}`).toString().trim()
  }
}
const btc = new BitcoinCli(DATA_DIR)

describe('WalletAccountBtc', () => {
  async function mineBlock (account) {
    const minerAddr = btc.call('getnewaddress').toString().trim()

    btc.call(`generatetoaddress 1 ${minerAddr}`)

    // wait until client and server are in sync
    if (account) {
      await account.getBalance()
    }
  }

  async function createAndFundAccount () {
    const account = new WalletAccountBtc(SEED_PHRASE, RELATIVE_PATH, CONFIG)
    const recipient = btc.call('getnewaddress').toString().trim()
    btc.call(`sendtoaddress ${ACCOUNT.address} 0.01`)
    await mineBlock(account)
    return { account, recipient }
  }

  let account, recipient
  beforeAll(async () => {
    ;({ account, recipient } = await createAndFundAccount());
  });

  afterAll(() => {
    account.dispose()
  })

  describe('constructor', () => {
    test('should successfully initialize an account for the given seed phrase and path', () => {
      const account = new WalletAccountBtc(SEED_PHRASE, RELATIVE_PATH)
      expect(account.index).toBe(ACCOUNT.index)
      expect(account.path).toBe(ACCOUNT.path)
      expect(account.keyPair).toEqual({
        privateKey: new Uint8Array(Buffer.from(ACCOUNT.keyPair.privateKey, 'hex')),
        publicKey: new Uint8Array(Buffer.from(ACCOUNT.keyPair.publicKey, 'hex'))
      })
    })

    test('should successfully initialize an account for the given seed and path', () => {
      const account = new WalletAccountBtc(SEED, RELATIVE_PATH)
      expect(account.index).toBe(ACCOUNT.index)

      expect(account.path).toBe(ACCOUNT.path)

      expect(account.keyPair).toEqual({
        privateKey: new Uint8Array(Buffer.from(ACCOUNT.keyPair.privateKey, 'hex')),
        publicKey: new Uint8Array(Buffer.from(ACCOUNT.keyPair.publicKey, 'hex'))
      })
    })

    test('should throw if the seed phrase is invalid', () => {
      expect(() => new WalletAccountBtc(INVALID_SEED_PHRASE, RELATIVE_PATH)).toThrow('The seed phrase is invalid.')
    })

    test('should throw if the path is invalid', () => {
      expect(() => new WalletAccountBtc(SEED_PHRASE, "a'/b/c")).toThrow(/Expected BIP32Path/)
    })
  })

  describe('getAddress', () => {
    test('should return the correct address', async () => {
      const result = await account.getAddress()
      expect(result).toBe(ACCOUNT.address)
    })
  })

  describe('sign', () => {
    const MESSAGE = 'Dummy message to sign.'

    const EXPECTED_SIGNATURE = 'd70594939c4e5fc68694fd09c42aabccb715a22f88eb0a84dc333410236a76ee6061f863a86094bb3858ca44be048675516b02fd46dd3b6a23e2255367a44509'

    test('should return the correct signature', async () => {
      const signature = await account.sign(MESSAGE)

      expect(signature).toBe(EXPECTED_SIGNATURE)
    })
  })

  describe('verify', () => {
    const MESSAGE = 'Dummy message to sign.'

    const EXPECTED_SIGNATURE = 'd70594939c4e5fc68694fd09c42aabccb715a22f88eb0a84dc333410236a76ee6061f863a86094bb3858ca44be048675516b02fd46dd3b6a23e2255367a44509'

    test('should return true for a valid signature', async () => {
      const result = await account.verify(MESSAGE, EXPECTED_SIGNATURE)

      expect(result).toBe(true)
    })

    test('should return false for an invalid signature', async () => {
      const result = await account.verify('Another message.', EXPECTED_SIGNATURE)

      expect(result).toBe(false)
    })

    test('should throw on a malformed signature', async () => {
      await expect(account.verify(MESSAGE, 'A bad signature'))
        .rejects.toThrow('Expected Signature')
    })
  })

  describe('getBalance', () => {
    test('should return the correct balance of the account', async () => {
      const balance = await account.getBalance()
      expect(balance).toBe(1_000_000)
    })
  })

  describe('sendTransaction', () => {
    test('should successfully send a transaction and include it in a block', async () => {
      const TRANSACTION = { to: recipient, value: 1_000 }

      const { hash, fee } = await account.sendTransaction(TRANSACTION)

      // before it’s mined, fetch the exact fee from the mempool entry
      const mempoolEntry = JSON.parse(btc.call(`getmempoolentry ${hash}`))
      const exactFee = Math.round(mempoolEntry.fees.base * 1e8) // sats
      expect(exactFee).toBe(fee)

      // mine it into a block to inspect via gettransaction
      await mineBlock(account)

      const raw = btc.call(`gettransaction ${hash}`)
      const txInfo = JSON.parse(raw.toString())
      expect(txInfo.txid).toBe(hash)
      expect(txInfo.details[0].address).toBe(TRANSACTION.to)
      // details[0].amount is in btc (negative for sends); convert to sats
      expect(Math.round(Math.abs(txInfo.details[0].amount) * 1e8)).toBe(TRANSACTION.value)
    })

    test('should throw for dust-limit value', async () => {
      await expect(account.sendTransaction({ to: recipient, value: 500 })).rejects.toThrow('dust limit')
    })

    test('should throw when no UTXOs are available', async () => {
      const fresh = new WalletAccountBtc(SEED_PHRASE, "0'/0/20", CONFIG)
      await expect(fresh.sendTransaction({ to: recipient, value: 1000 })).rejects.toThrow('No unspent outputs available.')
    })

    test('should throw if total balance is less than amount + fee', async () => {
      await expect(account.sendTransaction({ to: recipient, value: 900_000_000_000 })).rejects.toThrow('Insufficient balance')
    })

    test('should throw if change is below dust', async () => {
      const lowBalance = new WalletAccountBtc(SEED_PHRASE, "0'/0/30", CONFIG)
      const addr = await lowBalance.getAddress()
      btc.call(`sendtoaddress ${addr} 0.00001`)
      await mineBlock(lowBalance)
      await expect(lowBalance.sendTransaction({ to: recipient, value: 1000 })).rejects.toThrow('Insufficient balance')
    })
  })

  describe('quoteSendTransaction', () => {
    function computeExpectedFee ({ to, value }) {
      const psbt = JSON.parse(
        btc.call(
          `walletcreatefundedpsbt [] '{"${to}":${(value / 1e8).toFixed(8)}}' 0 '{"subtractFeeFromOutputs":[], "fee_rate":0}' true`
        )
      ).psbt
      const vsize = JSON.parse(btc.call(`decodepsbt ${psbt}`)).tx.vsize
      let r = 1
      try {
        const f = JSON.parse(btc.call('estimatesmartfee 1')).feerate
        if (f && f > 0) r = Math.ceil((f * 1e8) / 1000)
      } catch {}
      return Math.max(Math.ceil(r * vsize), 141)
    }

    test('should successfully quote a transaction', async () => {
      const TRANSACTION = { to: recipient, value: 100_000 }
      const expected_fee = computeExpectedFee(TRANSACTION)
      const { fee } = await account.quoteSendTransaction(TRANSACTION)
      expect(fee).toBe(expected_fee)
    })
  })

  describe('getTransfers', () => {
    async function createIncomingTransfer (account) {
      const addr = await account.getAddress()
      const txid = btc.call(`sendtoaddress ${addr} 0.01`)
      await mineBlock(account)
      const height = Number(btc.call('getblockcount'))
      const info = JSON.parse(btc.call(`gettransaction ${txid}`))
      const vout = info.details[0].vout
      const fee = Math.round(Math.abs(info.fee) * 1e8)
      return {
        txid,
        height,
        value: 1_000_000,
        vout,
        direction: 'incoming',
        recipient: addr,
        fee,
        address: addr
      }
    }

    async function createOutgoingTransfer (account, recipient, value) {
      const { hash, fee } = await account.sendTransaction({ to: recipient, value })
      await mineBlock(account)
      const height = Number(btc.call('getblockcount'))
      return {
        txid: hash,
        height,
        value,
        vout: 0, // first output in a single-recipient tx
        direction: 'outgoing',
        recipient,
        fee,
        address: await account.getAddress()
      }
    }

    let txAccount, txRecipient
    const TRANSFERS = []

    beforeAll(async () => {
      txAccount = new WalletAccountBtc(SEED_PHRASE, "0'/0'/1/0", CONFIG)
      txRecipient = btc.call('getnewaddress')

      TRANSFERS.push(
        await createIncomingTransfer(txAccount)
      )
      TRANSFERS.push(
        await createOutgoingTransfer(txAccount, txRecipient, 100_000)
      )
      TRANSFERS.push(
        await createOutgoingTransfer(txAccount, txRecipient, 200_000)
      )
    })

    test('should return the transfer history of the account', async () => {
      const transfers = await txAccount.getTransfers()
      expect(transfers).toEqual(TRANSFERS)
    })

    test('should return the incoming transfer history of the account', async () => {
      const transfers = await txAccount.getTransfers({ direction: 'incoming' })
      expect(transfers).toEqual([TRANSFERS[0]])
    })

    test('should return the outgoing transfer history of the account', async () => {
      const transfers = await txAccount.getTransfers({ direction: 'outgoing' })
      expect(transfers).toEqual([TRANSFERS[1], TRANSFERS[2]])
    })

    test('should return the transfer history of the account with pagination', async () => {
      const transfers = await txAccount.getTransfers({ limit: 1, skip: 1 })
      expect(transfers).toEqual([TRANSFERS[1]])
    })

    test('should return the outgoing transfer history of the account with pagination', async () => {
      const transfers = await txAccount.getTransfers({ direction: 'outgoing', limit: 1, skip: 1 })
      expect(transfers).toEqual([TRANSFERS[1]])
    })

    test('should return an empty array when limit is 0', async () => {
      const transfers = await txAccount.getTransfers({ limit: 0 })
      expect(transfers).toEqual([])
    })
  })

  describe.each([
    ['getTokenBalance', ['dummy']],
    ['transfer', ['dummy']],
    ['quoteTransfer', ['dummy']]
  ])('%s', (method, args) => {
    test('throws unsupported error', async () => {
      await expect(account[method](...args))
        .rejects.toThrow(/not supported on the bitcoin blockchain/)
    })
  })
})
