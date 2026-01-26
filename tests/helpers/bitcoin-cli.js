import { execSync } from 'child_process'
import { platform } from 'os'

const EXEC_SYNC_OPTIONS = {
  stdio: ['inherit', 'pipe', 'ignore']
}

const isWindows = platform() === 'win32'

export default class BitcoinCli {
  constructor ({ wallet, ...config }) {
    const { host, port, dataDir } = config

    this._wallet = wallet

    let actualDataDir = dataDir
    if (isWindows && !dataDir.startsWith('/')) {
      const wslUsername = execSync('wsl whoami', { stdio: 'pipe' }).toString().trim()
      const normalizedDir = dataDir.replace(/^\.\//, '')
      actualDataDir = `/home/${wslUsername}/${normalizedDir}`
    }

    this._config = { ...config, dataDir: actualDataDir }

    const prefix = isWindows ? 'wsl ' : ''
    this._cli = `${prefix}bitcoin-cli -regtest -rpcconnect=${host} -rpcport=${port} -datadir=${actualDataDir}`
  }

  setWallet (wallet) {
    this._wallet = wallet
  }

  start () {
    const { host, port, dataDir, zmqPort } = this._config

    const prefix = isWindows ? 'wsl ' : ''
    execSync(`${prefix}bitcoind -regtest -daemon ` +
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

  estimateSmartFee (confTarget = 1, mode = 'conservative') {
    return this.call(`estimatesmartfee ${confTarget} ${mode}`)
  }

  estimateSatsPerVByte (confTarget = 1, mode = 'conservative') {
    const smartFee = this.estimateSmartFee(confTarget, mode)

    const feeRate = smartFee?.feerate ? Number(smartFee.feerate) : 0

    return Math.max(Math.round(feeRate * 100_000), 1)
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

    const feeSats = inputTotal - outputTotal

    return feeSats
  }
}
