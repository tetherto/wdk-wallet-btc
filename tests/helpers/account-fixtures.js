import * as bip39 from 'bip39'
import { BIP32Factory } from 'bip32'
import * as ecc from '@bitcoinerlab/secp256k1'
import { hmac } from '@noble/hashes/hmac'
import { sha512 } from '@noble/hashes/sha512'
import { payments, networks, crypto as btccrypto } from 'bitcoinjs-lib'

const bip32 = BIP32Factory(ecc)

const MASTER_SECRET = Buffer.from('Bitcoin seed', 'utf8')

const BITCOIN_BIP32 = {
  wif: 0x80,
  bip32: {
    public: 0x0488b21e,
    private: 0x0488ade4
  },
  messagePrefix: '\x18Bitcoin Signed Message:\n',
  bech32: 'bc',
  pubKeyHash: 0x00,
  scriptHash: 0x05
}

export const SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'
export const SEED = bip39.mnemonicToSeedSync(SEED_PHRASE)

function derivePathFromSeed (seed, path) {
  const I = hmac(sha512, MASTER_SECRET, seed)
  const priv = I.slice(0, 32)
  const chain = I.slice(32)

  const master = bip32.fromPrivateKey(Buffer.from(priv), Buffer.from(chain), BITCOIN_BIP32)
  const account = master.derivePath(path)

  return { master, account }
}

export function getBtcAccount (index, bip = 84) {
  const path = `m/${bip}'/0'/0'/0/${index}`
  const { account } = derivePathFromSeed(SEED, path)

  const address =
    bip === 44
      ? payments.p2pkh({ pubkey: account.publicKey, network: networks.regtest }).address
      : payments.p2wpkh({ pubkey: account.publicKey, network: networks.regtest }).address

  return {
    index,
    path,
    address,
    keyPair: {
      privateKey: Buffer.from(account.privateKey).toString('hex'),
      publicKey: Buffer.from(account.publicKey).toString('hex')
    }
  }
}

export function getExpectedSignature (index, message, bip = 84) {
  const path = `m/${bip}'/0'/0'/0/${index}`
  const { account } = derivePathFromSeed(SEED, path)
  const msgHash = btccrypto.sha256(Buffer.from(message, 'utf8'))
  return account.sign(msgHash).toString('hex')
}

export const ACCOUNT_BIP44 = getBtcAccount(0, 44)
export const ACCOUNT_BIP84 = getBtcAccount(0, 84)
