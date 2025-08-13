import { execSync, spawn, exec } from 'child_process'
import { platform } from 'os'
import { resolve } from 'path'

const EXEC_SYNC_OPTIONS = {
  stdio: ['inherit', 'pipe', 'ignore']
}

const isWindows = platform() === 'win32'

export default class BitcoinCli {
  constructor ({ wallet, ...config }) {
    const { host, port, dataDir } = config

    this._config = config
    this._wallet = wallet

    // On Windows, use WSL path for datadir and WSL IP for connection
    if (platform() === 'win32') {
      const wslUsername = execSync('wsl whoami', { stdio: 'pipe' }).toString().trim()
      const wslDataDir = `/home/${wslUsername}/${dataDir}`
      // Use the WSL IP address for connection
      this._cli = `bitcoin-cli -regtest -rpcconnect=${host} -rpcport=${port} -datadir=${wslDataDir}`
    } else {
      this._cli = `bitcoin-cli -regtest -rpcconnect=${host} -rpcport=${port} -datadir=${dataDir}`
    }
    
    // Store the bitcoind process for Windows
    this._bitcoindProcess = null
  }

  setWallet (wallet) {
    this._wallet = wallet
  }

  start () {
    const { host, port, dataDir, zmqPort } = this._config

    if (isWindows) {
      // On Windows, use exec with callback to run bitcoind in background
      // Use WSL home directory to avoid permission issues
      const wslUsername = execSync('wsl whoami', { stdio: 'pipe' }).toString().trim()
      const wslDataDir = `/home/${wslUsername}/${dataDir}`
      console.log(`🔍 Debug bitcoin-cli: WSL path: ${wslDataDir}`)
      
      exec('bitcoind -regtest -server=1 -txindex=1 -fallbackfee=0.0001 -paytxfee=0.0001 -minrelaytxfee=0.000001 ' +
        `-rpcbind=${host} ` +
        `-rpcallowip=${host}/0 ` +
        `-rpcport=${port} ` +
        `-datadir=${wslDataDir} ` +
        `-zmqpubhashblock=tcp://${host}:${zmqPort}`, {
        shell: true
      }, (error, stdout, stderr) => {
        // Ignore errors - bitcoind is a long-running process
        if (error) {
          // Only log if it's a real error, not just that it's still running
          if (error.code !== 'ENOENT') {
            console.warn('bitcoind startup warning:', error.message)
            if (stderr) {
              console.warn('bitcoind stderr:', stderr.toString())
            }
            if (stdout) {
              console.warn('bitcoind stdout:', stdout.toString())
            }
          }
        }
      })
      
      // No need to store process since exec handles it in background
      this._bitcoindProcess = null
    } else {
      // On Unix systems, use -daemon flag with execSync
      execSync('bitcoind -regtest -daemon ' +
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
  }

  stop () {
    if (isWindows && this._bitcoindProcess) {
      // On Windows, kill the spawned process
      try {
        this._bitcoindProcess.kill('SIGTERM')
        this._bitcoindProcess = null
      } catch (error) {
        // If process is already dead, ignore
      }
    }
    
    // Always try to stop via RPC as well
    try {
      execSync(`${this._cli} stop`, EXEC_SYNC_OPTIONS)
    } catch (error) {
      // Ignore errors if bitcoind is already stopped
    }
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

  getBlockCount () {
    return this.call('getblockcount')
  }

  getBlockchainInfo () {
    return this.call('getblockchaininfo')
  }
}
