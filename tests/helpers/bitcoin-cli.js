import { execSync } from 'child_process'
import {
  BITCOIN_CLI_PATH,
  BITCOIND_PATH
} from '../config.js'

const EXEC_SYNC_OPTIONS = {
  stdio: ['inherit', 'pipe', 'ignore']
}

export default class BitcoinCli {
  constructor ({ wallet, ...config }) {
    const { host, port, dataDir } = config

    this._config = config

    this._wallet = wallet

    this._cli = `${BITCOIN_CLI_PATH} -regtest -rpcconnect=${host} -rpcport=${port} -datadir=${dataDir}`
  }

  setWallet (wallet) {
    this._wallet = wallet
  }

  start () {
    const { host, port, dataDir, zmqPort } = this._config

    execSync(BITCOIND_PATH + ' -regtest -daemon ' +
      '-server=1 ' +
      '-txindex=1 ' +
      '-fallbackfee=0.0001 ' +
      '-paytxfee=0.0001 ' +
      '-minrelaytxfee=0.000001 ' +
      `-rpcbind=${host} ` +
      `-rpcport=${port} ` +
      `-datadir=${dataDir} ` +
      `-zmqpubhashblock=tcp://${host}:${zmqPort}`, EXEC_SYNC_OPTIONS)
  }

  stop () {
    execSync(`${this._cli} stop`, EXEC_SYNC_OPTIONS)
  }

  call (cmd, options = { }) {
    const { rawResult } = options
    const walletFlag = this._wallet ? `-rpcwallet=${this._wallet}` : ''
    const command = `${this._cli} ${walletFlag} ${cmd}`
    const output = execSync(command, EXEC_SYNC_OPTIONS)

    const result = output.toString().trim()

    return rawResult ? result : JSON.parse(result)
  }

  createWallet (wallet) {
    return this.call(`createwallet ${wallet}`, { rawResult: true })
  }

  getNewAddress () {
    return this.call('getnewaddress', { rawResult: true })
  }

  sendToAddress (address, amount) {
    return this.call(`sendtoaddress ${address} ${amount}`, { rawResult: true })
  }

  generateToAddress (blocks, address) {
    return this.call(`generatetoaddress ${blocks} ${address}`)
  }

  getMempoolEntry (txid) {
    return this.call(`getmempoolentry ${txid}`)
  }

  getTransaction (txid) {
    return this.call(`gettransaction ${txid}`)
  }

  getRawTransaction (txid) {
    return this.call(`getrawtransaction ${txid} true`)
  }

  getBlockCount () {
    return this.call('getblockcount')
  }

  getBlockchainInfo () {
    return this.call('getblockchaininfo')
  }

  getRawTransactionVerbose (txid) {
    return this.call(`getrawtransaction ${txid} true`)
  }

  getTransactionFeeSats (txid) {
    const tx = this.getRawTransactionVerbose(txid)

    const inputTotal = tx.vin.reduce((sum, vin) => {
      const prev = this.getRawTransactionVerbose(vin.txid)
      const prevOut = prev.vout[vin.vout]
      return sum + Math.round(prevOut.value * 1e8)
    }, 0)

    const outputTotal = tx.vout.reduce((sum, out) => {
      return sum + Math.round(out.value * 1e8)
    }, 0)

    return inputTotal - outputTotal
  }
}
