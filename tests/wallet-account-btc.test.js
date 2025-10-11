import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import { mnemonicToSeedSync } from 'bip39'

import { HOST, PORT, ELECTRUM_PORT, ZMQ_PORT, DATA_DIR } from './config.js'

import { BitcoinCli, Waiter } from './helpers/index.js'

import { WalletAccountBtc, WalletAccountReadOnlyBtc } from '../index.js'

const SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'

const INVALID_SEED_PHRASE = 'invalid seed phrase'

const SEED = mnemonicToSeedSync(SEED_PHRASE)

const ACCOUNTS = {
  44: {
    index: 0,
    path: "m/44'/0'/0'/0/0",
    address: 'mjWcNW3MnJdb6ihYRmyoywL4xm4a7n4JYH',
    keyPair: {
      privateKey: 'd405730e81abfd3c50de982134b2117469915df4b03dc2827fd646410485c148',
      publicKey: '03c061f44a568ab1b16db34b9bef4eeb21b75bb25fcd3af48e4eb60313fc99c86b'
    }
  },
  84: {
    index: 0,
    path: "m/84'/0'/0'/0/0",
    address: 'bcrt1qxn0te9ecv864wtu53cccjhuuy5dphvemjt58ge',
    keyPair: {
      privateKey: '433c8e1e0064cdafe991f1efb4803d7dfcc2533db7d5cfa963ed53917b720248',
      publicKey: '035a48902f37c03901f36fea0a06aef2be29d9c55da559f5bd02c2d02d2b516382'
    }
  }
}

const SIGNATURES = {
  44: '13287d7e5a924bf2c7e10bb78977925d17dd765ac9ff79eb774d77b0a7caccfc6173463d4845d74c3c8c97a76352f203643e958cc4d8732744be4f9d961eb4db',
  84: 'd70594939c4e5fc68694fd09c42aabccb715a22f88eb0a84dc333410236a76ee6061f863a86094bb3858ca44be048675516b02fd46dd3b6a23e2255367a44509'
}

describe.each([44, 84])(`WalletAccountBtc`, (bip) => {
  const CONFIGURATION = {
    host: HOST,
    port: ELECTRUM_PORT,
    network: 'regtest',
    bip
  }

  const bitcoin = new BitcoinCli({
    host: HOST,
    port: PORT,
    zmqPort: ZMQ_PORT,
    dataDir: DATA_DIR,
    wallet: 'testwallet'
  })

  const waiter = new Waiter(bitcoin, {
    host: HOST,
    electrumPort: ELECTRUM_PORT,
    zmqPort: ZMQ_PORT
  })

  let account, recipient

  beforeAll(async () => {
    account = new WalletAccountBtc(SEED_PHRASE, "0'/0/0", CONFIGURATION)
    recipient = bitcoin.getNewAddress()

    bitcoin.sendToAddress(ACCOUNTS[bip].address, 0.01)

    await waiter.mine()
  })

  afterAll(() => {
    account.dispose()
  })

  describe('constructor', () => {
    test('should successfully initialize an account for the given seed phrase and path', () => {
      const account = new WalletAccountBtc(SEED_PHRASE, "0'/0/0", CONFIGURATION)

      expect(account.index).toBe(ACCOUNTS[bip].index)

      expect(account.path).toBe(ACCOUNTS[bip].path)

      expect(account.keyPair).toEqual({
        privateKey: new Uint8Array(Buffer.from(ACCOUNTS[bip].keyPair.privateKey, 'hex')),
        publicKey: new Uint8Array(Buffer.from(ACCOUNTS[bip].keyPair.publicKey, 'hex'))
      })

      account.dispose()
    })

    test('should successfully initialize an account for the given seed and path', () => {
      const account = new WalletAccountBtc(SEED, "0'/0/0", CONFIGURATION)

      expect(account.index).toBe(ACCOUNTS[bip].index)

      expect(account.path).toBe(ACCOUNTS[bip].path)

      expect(account.keyPair).toEqual({
        privateKey: new Uint8Array(Buffer.from(ACCOUNTS[bip].keyPair.privateKey, 'hex')),
        publicKey: new Uint8Array(Buffer.from(ACCOUNTS[bip].keyPair.publicKey, 'hex'))
      })

      account.dispose()
    })

    test('should throw if the seed phrase is invalid', () => {
      expect(() => new WalletAccountBtc(INVALID_SEED_PHRASE, "0'/0/0", CONFIGURATION))
        .toThrow('The seed phrase is invalid.')
    })

    test('should throw if the path is invalid', () => {
      expect(() => new WalletAccountBtc(SEED_PHRASE, "a'/b/c", CONFIGURATION))
        .toThrow(/Expected BIP32Path/)
    })

    test('should throw for unsupported bip specifications', () => {
      expect(() => new WalletAccountBtc(SEED_PHRASE, "0'/0/0", { bip: 1 }))
        .toThrow(/Invalid bip specification/)
    })
  })

  describe('getAddress', () => {
    test('should return the correct address', async () => {
      const result = await account.getAddress()

      expect(result).toBe(ACCOUNTS[bip].address)
    })
  })

  describe('sign', () => {
    const MESSAGE = 'Dummy message to sign.'

    test('should return the correct signature', async () => {
      const signature = await account.sign(MESSAGE)

      expect(signature).toBe(SIGNATURES[bip])
    })
  })

  describe('verify', () => {
    const MESSAGE = 'Dummy message to sign.'

    test('should return true for a valid signature', async () => {
      const result = await account.verify(MESSAGE, SIGNATURES[bip])

      expect(result).toBe(true)
    })

    test('should return false for an invalid signature', async () => {
      const result = await account.verify('Another message.', SIGNATURES[bip])

      expect(result).toBe(false)
    })

    test('should throw on a malformed signature', async () => {
      await expect(account.verify(MESSAGE, 'A bad signature'))
        .rejects.toThrow('Expected Signature')
    })
  })

  describe('sendTransaction', () => {
    test('should successfully send a transaction', async () => {
      const TRANSACTION = { to: recipient, value: 1_000 }

      const { hash, fee } = await account.sendTransaction(TRANSACTION)

      await waiter.mine()

      const transaction = bitcoin.getTransaction(hash)
      expect(transaction.txid).toBe(hash)
      expect(transaction.details[0].address).toBe(TRANSACTION.to)

      const amount = Math.round(transaction.details[0].amount * 1e+8)
      expect(amount).toBe(TRANSACTION.value)

      const feeSats = bitcoin.getTransactionFeeSats(hash)
      expect(fee).toBe(BigInt(feeSats))
    })

    test('should create a change output when leftover > dust limit', async () => {
      const TRANSACTION = { to: recipient, value: 500_000 }

      const account = new WalletAccountBtc(SEED_PHRASE, "0'/0/1", CONFIGURATION)
      const address = await account.getAddress()
      bitcoin.sendToAddress(address, 0.02)
      await waiter.mine()

      const { hash } = await account.sendTransaction(TRANSACTION)
      await waiter.mine()

      const rawTransaction = bitcoin.getRawTransaction(hash)

      const outputs = rawTransaction.vout.map(({ scriptPubKey }) =>
        scriptPubKey.address || (scriptPubKey.addresses && scriptPubKey.addresses[0])
      )

      expect(outputs).toContain(TRANSACTION.to)

      expect(outputs).toContain(address)

      account.dispose()
    })

    test('should collapse dust change into fee when leftover <= dust limit', async () => {
      const account = new WalletAccountBtc(SEED_PHRASE, "0'/0/5", CONFIGURATION)
      const address = await account.getAddress()
      bitcoin.sendToAddress(address, 0.001)
      await waiter.mine()

      const balance = await account.getBalance()
      const nearMaxAmount = Math.max(1, Number(balance) - 2_000)
      const { fee: feeEstimate } = await account.quoteSendTransaction({ to: recipient, value: nearMaxAmount })

      const dustLimit = account._dustLimit
      const spend = Math.max(1, Number(balance) - Number(feeEstimate) - (dustLimit - 1))
      const { hash, fee } = await account.sendTransaction({ to: recipient, value: spend })
      await waiter.mine()

      const rawTransaction = bitcoin.getRawTransaction(hash)

      const outputs = rawTransaction.vout.map(({ scriptPubKey }) =>
        scriptPubKey.address || (scriptPubKey.addresses && scriptPubKey.addresses[0])
      )

      expect(outputs).toContain(recipient)
      expect(outputs).not.toContain(address)
      expect(fee).toBe(balance - BigInt(spend))

      account.dispose()
    })

    test('should throw if value is less than the dust limit', async () => {
      const value = Math.floor(account._dustLimit / 2)
      await expect(account.sendTransaction({ to: recipient, value }))
        .rejects.toThrow('The amount must be bigger than the dust limit')
    })

    test('should throw if the account balance does not cover the transaction costs', async () => {
      await expect(account.sendTransaction({ to: recipient, value: 1_000_000_000_000 }))
        .rejects.toThrow('Insufficient balance to send the transaction')
    })

    test('should throw if there an no utxos available', async () => {
      const account = new WalletAccountBtc(SEED_PHRASE, "0'/0/2", CONFIGURATION)

      await expect(account.sendTransaction({ to: recipient, value: 1_000 }))
        .rejects.toThrow('No unspent outputs available')

      account.dispose()
    })
  })

  describe('transfer', () => {
    test('should throw an unsupported operation error', async () => {
      await expect(account.transfer({}))
        .rejects.toThrow("The 'transfer' method is not supported on the bitcoin blockchain.")
    })
  })

  describe('getTransactionReceipt', () => {
    test('should return the correct transaction receipt', async () => {
      const TRANSACTION = { to: recipient, value: 1_000 }

      const account = new WalletAccountBtc(SEED_PHRASE, "0'/0/4", CONFIGURATION)
      const address = await account.getAddress()
      bitcoin.sendToAddress(address, 0.01)
      await waiter.mine()

      const { hash } = await account.sendTransaction(TRANSACTION)
      await waiter.mine()

      const receipt = await account.getTransactionReceipt(hash)
      expect(receipt.getId()).toBe(hash)

      const rawTransaction = bitcoin.getRawTransaction(hash)
      expect(receipt.version).toBe(rawTransaction.version)
      expect(receipt.locktime).toBe(rawTransaction.locktime)

      for (let i = 0; i < rawTransaction.vin.length; i++) {
        expect(receipt.ins[i].sequence).toBe(rawTransaction.vin[i].sequence)
      }

      for (let i = 0; i < rawTransaction.vout.length; i++) {
        const vout = rawTransaction.vout[i]
        const out = receipt.outs[i]
        const feeSats = Math.round(vout.value * 1e+8)

        expect(out.value).toBe(feeSats)
        expect(out.script.toString('hex')).toBe(vout.scriptPubKey.hex)
      }

      account.dispose()
    })

    test('should return null if the transaction has not been included in a block yet', async () => {
      const HASH = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

      const receipt = await account.getTransactionReceipt(HASH)

      expect(receipt).toBeNull()
    })

    test('should throw an error for an invalid txid format', async () => {
      await expect(account.getTransactionReceipt('invalid-tx-id'))
        .rejects.toThrow("The 'getTransactionReceipt(hash)' method requires a valid transaction hash to fetch the receipt.")
    })
  })

  describe('getTransfers', () => {
    const TRANSFERS = []

    let account

    async function createIncomingTransfer () {
      const address = await account.getAddress()
      const hash = bitcoin.sendToAddress(address, 0.01)
      await waiter.mine()

      const transaction = bitcoin.getTransaction(hash)
      const fee = Math.round(Math.abs(transaction.fee) * 1e+8)

      return {
        txid: hash,
        address,
        vout: transaction.details[0].vout,
        height: transaction.blockheight,
        value: 1_000_000,
        direction: 'incoming',
        fee,
        recipient: address
      }
    }

    async function createOutgoingTransfer () {
      const address = await account.getAddress()

      const recipient = bitcoin.getNewAddress()

      const { hash, fee } = await account.sendTransaction({
        to: recipient,
        value: 100_000
      })

      await waiter.mine()

      const transaction = bitcoin.getTransaction(hash)

      return {
        txid: hash,
        address,
        vout: 0,
        height: transaction.blockheight,
        value: 100_000,
        direction: 'outgoing',
        fee: Number(fee),
        recipient
      }
    }

    beforeAll(async () => {
      account = new WalletAccountBtc(SEED_PHRASE, "0'/0/10", CONFIGURATION)

      for (let i = 0; i < 5; i++) {
        const transfer = i % 2 === 0
          ? await createIncomingTransfer()
          : await createOutgoingTransfer()

        TRANSFERS.push(transfer)
      }
    })

    afterAll(() => {
      account.dispose()
    })

    test('should return the full transfer history', async () => {
      const transfers = await account.getTransfers()

      expect(transfers).toEqual(TRANSFERS)
    })

    test('should return the incoming transfer history', async () => {
      const transfers = await account.getTransfers({ direction: 'incoming' })

      expect(transfers).toEqual([TRANSFERS[0], TRANSFERS[2], TRANSFERS[4]])
    })

    test('should return the outgoing transfer history', async () => {
      const transfers = await account.getTransfers({ direction: 'outgoing' })

      expect(transfers).toEqual([TRANSFERS[1], TRANSFERS[3]])
    })

    test('should correctly paginate the transfer history', async () => {
      const transfers = await account.getTransfers({ limit: 2, skip: 1 })

      expect(transfers).toEqual([TRANSFERS[1], TRANSFERS[2]])
    })

    test('should correctly filter and paginate the transfer history', async () => {
      const transfers = await account.getTransfers({ limit: 2, skip: 1, direction: 'incoming' })

      expect(transfers).toEqual([TRANSFERS[2], TRANSFERS[4]])
    })
  })

  describe('toReadOnlyAccount', () => {
    test('should return a read-only copy of the account', async () => {
      const readOnlyAccount = await account.toReadOnlyAccount()

      expect(readOnlyAccount).toBeInstanceOf(WalletAccountReadOnlyBtc)

      expect(await readOnlyAccount.getAddress()).toBe(ACCOUNTS[bip].address)

      readOnlyAccount._electrumClient.close()
    })
  })
})
