import { execSync } from 'child_process'

export default class BitcoinCli {
  constructor (dataDir, host, zmqPort, rpcPort, walletName = null) {
    this.dataDir = dataDir
    this.wallet = walletName
    this.host = host
    this.zmqPort = zmqPort
    this.rpcPort = rpcPort
    this.base = `bitcoin-cli -regtest -datadir=${dataDir} -rpcconnect=${host} -rpcport=${rpcPort}`
  }

  setWallet (walletName) {
    this.wallet = walletName
  }

  call (cmd) {
    const walletFlag = this.wallet ? ` -rpcwallet=${this.wallet}` : ''
    const fullCmd = `${this.base}${walletFlag} ${cmd}`
    return execSync(fullCmd).toString().trim()
  }

  start () {
    const cmd = 'bitcoind -regtest -daemon ' +
      '-txindex=1 ' +
      '-fallbackfee=0.00010000 ' +
      '-paytxfee=0.00010000 ' +
      '-server=1 ' +
      `-rpcbind=${this.host} ` +
      `-rpcport=${this.rpcPort} ` +
      '-minrelaytxfee=0.00000100 ' +
      `-zmqpubhashblock=tcp://${this.host}:${this.zmqPort} ` +
      `-datadir=${this.dataDir}`
    execSync(cmd)
  }

  stop () {
    execSync(`${this.base} stop`)
  }
}
