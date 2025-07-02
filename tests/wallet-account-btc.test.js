import 'dotenv/config'
import { describe, test, expect, beforeEach } from '@jest/globals'
import { mnemonicToSeedSync } from 'bip39'
import { execSync } from 'child_process'

import WalletAccountBtc from '../src/wallet-account-btc.js'

const SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'
const INVALID_SEED_PHRASE = 'this is not valid mnemonic'
const SEED = mnemonicToSeedSync(SEED_PHRASE)

const ACCOUNT = {
  index: 0,
  path: "m/84'/0'/0'/0/0",
  address: 'bc1qxn0te9ecv864wtu53cccjhuuy5dphvem6ykeyr',
  keyPair: {
    privateKey: '433c8e1e0064cdafe991f1efb4803d7dfcc2533db7d5cfa963ed53917b720248',
    publicKey: '035a48902f37c03901f36fea0a06aef2be29d9c55da559f5bd02c2d02d2b516382'
  }
}

const DATA_DIR = process.env.DATA_DIR || `${process.env.HOME}/.bitcoin`
const BCLI = `bitcoin-cli -regtest -datadir=${DATA_DIR} -rpcwallet=testwallet`
const callBitcoin = cmd => execSync(`${BCLI} ${cmd}`)

const config = {
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 7777),
  network: 'regtest'
}

let minerAddr = null
const mineBlock = async (account) => {
  if (!minerAddr) {
    minerAddr = callBitcoin(`getnewaddress`).toString().trim()
  }

  callBitcoin(`generatetoaddress 1 ${minerAddr}`)

  // wait until client and server are in sync
  if (account) {
    await account.getBalance()
  }
}

describe('WalletAccountBtc', () => {
  let account
  let address
  let recipient

  beforeEach(async () => {
    account = new WalletAccountBtc(SEED_PHRASE, ACCOUNT.path, config)
    address = await account.getAddress()
    recipient = callBitcoin(`getnewaddress`).toString().trim()
    callBitcoin(`sendtoaddress ${address} 0.01`)
    await mineBlock(account)
  })

  describe('constructor', () => {
    test('should successfully initialize an account for the given seed phrase and path', () => {
      const account = new WalletAccountBtc(SEED_PHRASE, ACCOUNT.path)
      expect(account.index).toBe(ACCOUNT.index)
      expect(account.path).toBe(ACCOUNT.path)
      expect(account.keyPair).toEqual({
        privateKey: ACCOUNT.keyPair.privateKey,
        publicKey: ACCOUNT.keyPair.publicKey
      })
    })

    test('should successfully initialize an account for the given seed and path', () => {
      const acc = new WalletAccountBtc(SEED, ACCOUNT.path)
      expect(acc.index).toBe(ACCOUNT.index)
      expect(acc.path).toBe(ACCOUNT.path)
    })

    test('should throw if the seed phrase is invalid', () => {
      expect(() => new WalletAccountBtc(INVALID_SEED_PHRASE, ACCOUNT.path)).toThrow('The seed phrase is invalid.')
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
        .rejects.toThrow('invalid BytesLike value')
    })
  })

  describe('sendTransaction', () => {
    test('should successfully send a transaction and include it in a block', async () => {
      const TRANSACTION = { to: recipient, value: 1_000 }

      const { hash, fee } = await account.sendTransaction(TRANSACTION)
      await mineBlock(account)

      const raw = callBitcoin(`gettransaction ${hash}`)
      const txInfo = JSON.parse(raw.toString())

      expect(txInfo.txid).toBe(hash)
      expect(txInfo.details[0].address).toBe(TRANSACTION.to)
      // details[0].amount is in btc (negative for sends); convert to satoshis
      expect(Math.round(Math.abs(txInfo.details[0].amount) * 1e8)).toBe(TRANSACTION.value)
      // core reports fee as negative btc; convert to satoshis and abs()
      expect(Math.round(Math.abs(txInfo.fee) * 1e8)).toBe(fee)
    })

    test('should throw for dust-limit value', async () => {
      await expect(account.sendTransaction({ to: recipient, value: 500 })).rejects.toThrow('dust limit')
    })

    test('should throw when no UTXOs are available', async () => {
      const fresh = new WalletAccountBtc(SEED_PHRASE, "0'/0/20", config)
      await expect(fresh.sendTransaction({ to: recipient, value: 1000 })).rejects.toThrow('No unspent outputs available.')
    })

    test('should throw if total balance is less than amount + fee', async () => {
      await expect(account.sendTransaction({ to: recipient, value: 900_000_000_000 })).rejects.toThrow('Insufficient balance')
    })

    test('should throw if change is below dust', async () => {
      const lowBalance = new WalletAccountBtc(SEED_PHRASE, "0'/0/30", config)
      const addr = await lowBalance.getAddress()
      callBitcoin(`sendtoaddress ${addr} 0.00001`)
      await mineBlock(lowBalance)
      await expect(lowBalance.sendTransaction({ to: recipient, value: 1000 })).rejects.toThrow('Insufficient balance')
    })
  })

  describe('quoteSendTransaction', () => {
    test('should return the expected fee', async () => {
      const fee = await account.quoteTransaction({ to: recipient, value: 1000 })
      expect(typeof fee).toBe('number')
      console.log("FEE IS:", fee)
      expect(fee).toBeGreaterThan(0)
    })
  })

  describe('getBalance', () => {
    test('should return a number', async () => {
      const balance = await account.getBalance()
      expect(balance).toBe(1_000_000)
    })
  })

  describe('getTokenBalance', () => {
    test('should throw unsupported error', async () => {
      await expect(account.getTokenBalance('dummy')).rejects.toThrow('Method not supported on the bitcoin blockchain.')
    })
  })

  describe('getTransfers', () => {
    let transferAccount;
    let transferRecipient;
    let incomingTxid;
    let outgoingTxid1, fee1, heightOut1;
    let outgoingTxid2, fee2, heightOut2;
    let heightIn;
    const TRANSFERS = [];

  beforeAll(async () => {
    transferAccount = new WalletAccountBtc(SEED_PHRASE, ACCOUNT.path, config);
    transferRecipient = callBitcoin(`getnewaddress`).toString().trim();

    // incoming transfer from node to account
    const addr = await transferAccount.getAddress();
    incomingTxid = callBitcoin(`sendtoaddress ${addr} 0.01`).toString().trim();
    await mineBlock(transferAccount);
    heightIn = Number(callBitcoin(`getblockcount`).toString().trim());

    // import account’s pk so we can spend that utxo:
    callBitcoin(`importprivkey ${ACCOUNT.keyPair.privateKey} importKey false`);

    // helper for outgoing txs
    async function makeOutgoing(valueSat) {
      const btcAmt = (valueSat / 1e8).toFixed(8);
      const txid = callBitcoin(`sendtoaddress ${transferRecipient} ${btcAmt}`).toString().trim();
      await mineBlock(transferAccount);
      const height = Number(callBitcoin(`getblockcount`).toString().trim());
      const info = JSON.parse(callBitcoin(`gettransaction ${txid}`).toString());
      const fee = Math.round(Math.abs(info.fee) * 1e8);
      return { txid, fee, height };
    }

    // first outgoing (1000 sat)
    ({ txid: outgoingTxid1, fee: fee1, height: heightOut1 } = await makeOutgoing(1000));

    // second outgoing (2000 sat)
    ({ txid: outgoingTxid2, fee: fee2, height: heightOut2 } = await makeOutgoing(2000));

    TRANSFERS.push(
      { direction: 'outgoing', txid: outgoingTxid2, amount: 2000, fee: fee2, height: heightOut2 },
      { direction: 'outgoing', txid: outgoingTxid1, amount: 1000, fee: fee1, height: heightOut1 },
      { direction: 'incoming', txid: incomingTxid, amount: 1_000_000, fee: undefined, height: heightIn }
    );
  });

    test('should return the transfer history of the account', async () => {
      const transfers = await transferAccount.getTransfers();
      expect(transfers).toEqual(TRANSFERS);
    });

    test('should return the incoming transfer history of the account', async () => {
      const transfers = await transferAccount.getTransfers({ direction: 'incoming' });
      expect(transfers).toEqual([TRANSFERS[2]]);
    });

    test('should return the outgoing transfer history of the account', async () => {
      const transfers = await transferAccount.getTransfers({ direction: 'outgoing' });
      expect(transfers).toEqual([TRANSFERS[0], TRANSFERS[1]]);
    });

    test('should return the transfer history of the account with pagination', async () => {
      const transfers = await transferAccount.getTransfers({ limit: 1, skip: 1 });
      expect(transfers).toEqual([TRANSFERS[1]]);
    });

    test('should return the outgoing transfer history of the account with pagination', async () => {
      const transfers = await transferAccount.getTransfers({ direction: 'outgoing', limit: 1, skip: 1 });
      expect(transfers).toEqual([TRANSFERS[1]]);
    });

    test('should return an empty array when limit is 0', async () => {
      const transfers = await transferAccount.getTransfers({ limit: 0 });
      expect(transfers).toEqual([]);
    });
  });

})
