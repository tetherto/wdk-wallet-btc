import { execSync } from 'child_process'

export default class BitcoinCli {
  constructor ({ wallet, ...config }) {
    const { host, port, dataDir } = config

    this._config = config

    this._wallet = wallet

    this._cli = `bitcoin-cli -regtest -rpcconnect=${host} -rpcport=${port} -datadir=${dataDir}`
  }

  setWallet (wallet) {
    this._wallet = wallet
  }

  start () {
    const { host, port, dataDir, zmqPort } = this._config

    execSync('bitcoind -regtest -daemon ' +
      '-server=1 ' +
      '-txindex=1 ' +
      '-fallbackfee=0.0001 ' +
      '-paytxfee=0.0001 ' +
      '-minrelaytxfee=0.000001 ' +
      `-rpcbind=${host} ` +
      `-rpcport=${port} ` +
      `-datadir=${dataDir} ` +
      `-zmqpubhashblock=tcp://${host}:${zmqPort}`, { stdio: 'ignore' })
  }

  stop () {
    execSync(`${this._cli} stop`, { stdio: 'ignore' })
  }

  call (cmd, options = { }) {
    const { rawResult } = options
    const walletFlag = this._wallet ? `-rpcwallet=${this._wallet}` : ''
    const fullCmd = `${this._cli} ${walletFlag} ${cmd}`
    const result = execSync(fullCmd).toString().trim()

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

  getBlockCount () {
    return this.call('getblockcount')
  }

  getBlockchainInfo () {
    return this.call('getblockchaininfo')
  }
}
