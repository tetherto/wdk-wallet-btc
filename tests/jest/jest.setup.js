import { execSync, spawn, exec } from 'child_process'
import { platform } from 'os'

import { HOST, PORT, ELECTRUM_PORT, ZMQ_PORT, DATA_DIR } from '../config.js'

import { BitcoinCli, Waiter } from '../helpers/index.js'

const BITCOIN_CORE_VERSION = 'v29.'
const BITCOIN_CORE_VERSION_UPDATED = 'v30.'

const ELECTRS_VERSION = 'v0.10.'

const WSL_VERSION = 2

const isWindows = platform() === 'win32'

function checkBitcoinCore () {
  try {
    const buffer = execSync(`bitcoind --version`, { stdio: ['inherit', 'pipe', 'ignore'] })
    const output = buffer.toString()
    return output.includes(BITCOIN_CORE_VERSION) || output.includes(BITCOIN_CORE_VERSION_UPDATED)
  } catch {
    return false
  }
}

function checkElectrs () {
  try {
    const buffer = execSync(`electrs --version`, { stdio: ['inherit', 'pipe', 'ignore'] })
    const output = buffer.toString()
    return output.includes(ELECTRS_VERSION)
  } catch {
    return false
  }
}

function checkWSL () {
  try {
    const buffer = execSync('wsl --version', { stdio: 'pipe' })
    const output = buffer.toString()
    const cleanOutput = output.replace(/\u0000/g, '')
    const versionMatch = cleanOutput.match(/WSL version: (\d+)\./)
    if (versionMatch) {
      const majorVersion = parseInt(versionMatch[1])
      return majorVersion >= WSL_VERSION
    }
    return false
  } catch {
    return false
  }
}

export default async () => {
  console.log('\n🧪 [Test Setup] Initializing Bitcoin regtest environment...')

  if (isWindows && !checkWSL()) {
    console.error('❗ You are missing the following tools:')
    console.error(`❌ WSL - install here: https://learn.microsoft.com/en-us/windows/wsl/install`)
    process.exit(1)
  }

  if (!checkBitcoinCore() || !checkElectrs()) {
    console.error('❗ You are missing the following tools:')
    console.error(`${checkBitcoinCore() ? '✅' : '❌'} Bitcoin Core\t${BITCOIN_CORE_VERSION}x.x+ - install here: https://bitcoin.org/en/download`)
    console.error(`${checkElectrs() ? '✅' : '❌'} Electrs\t${ELECTRS_VERSION}x+ - install here: https://github.com/romanz/electrs/blob/master/doc/install.md`)

    if (isWindows) {
      console.error('❌ You need to add bitcoin-cli, bitcoind and electrs to the PATH with WSL, possibly using a bat file for each')
    }
    process.exit(1)
  }

  let actualDataDir = DATA_DIR
  if (isWindows) {
    const wslUsername = execSync('wsl whoami', { stdio: 'pipe' }).toString().trim()
    const normalizedDir = DATA_DIR.replace(/^\.\//, '')
    actualDataDir = `/home/${wslUsername}/${normalizedDir}`
  }

  const bitcoin = new BitcoinCli({
    host: HOST,
    port: PORT,
    electrumPort: ELECTRUM_PORT,
    zmqPort: ZMQ_PORT,
    dataDir: actualDataDir
  })

  const waiter = new Waiter(bitcoin, {
    host: HOST,
    electrumPort: ELECTRUM_PORT,
    zmqPort: ZMQ_PORT
  })

  try {
    console.log('⛔ Stopping any previously running bitcoind instance...')
    bitcoin.stop()
  } catch {
    console.warn('⚠️ No previous bitcoind instance was running.')
  }

  console.log('🧹 Removing old regtest data...')
  if (isWindows) {
    execSync(`wsl rm -rf ${actualDataDir}/regtest`, { stdio: 'ignore' })
  } else {
    execSync(`rm -rf ${actualDataDir}/regtest`, { stdio: 'ignore' })
  }

  console.log(`📁 Ensuring data directory exists at ${actualDataDir}...`)
  if (isWindows) {
    execSync(`wsl mkdir -p ${actualDataDir}`, { stdio: 'ignore' })
  } else {
    execSync(`mkdir -p ${actualDataDir}`, { stdio: 'ignore' })
  }

  try {
    console.log(`🔍 Checking for processes using port ${PORT}...`)
    if (isWindows) {
      execSync(`wsl lsof -i :${PORT} | grep LISTEN | awk '{print $2}' | xargs kill -9`, { stdio: 'ignore' })
    } else {
      execSync(`lsof -i :${PORT} | grep LISTEN | awk '{print $2}' | xargs kill -9`, { stdio: 'ignore' })
    }
    console.log(`✅ Killed process on port ${PORT}.`)
  } catch {
    console.warn(`⚠️ No process was using port ${PORT}.`)
  }

  console.log('🚀 Starting bitcoind in regtest mode...')
  bitcoin.start()
  await waiter.waitUntilBitcoinCoreIsStarted()
  console.log('✅ bitcoind started.')

  console.log('🔌 Starting Electrum server...')
  if (isWindows) {
    exec('electrs --network regtest --daemon-dir ' + actualDataDir + ' --daemon-rpc-addr ' + HOST + ':' + PORT + ' --electrum-rpc-addr ' + HOST + ':' + ELECTRUM_PORT, {
      shell: true,
      stdio: 'ignore'
    }, (error) => {
      if (error) {
        console.warn('electrs startup warning:', error.message)
      }
    })
  } else {
    spawn('electrs', [
      '--network', 'regtest',
      '--daemon-dir', actualDataDir,
      '--electrum-rpc-addr', `${HOST}:${ELECTRUM_PORT}`
    ])
  }

  await waiter.waitUntilPortIsOpen(HOST, ELECTRUM_PORT)
  console.log('✅ Electrum server is running.')

  console.log('💼 Creating new wallet `testwallet`...')
  bitcoin.createWallet('testwallet')
  bitcoin.setWallet('testwallet')

  console.log('⛏️ Mining 101 blocks for initial funds...')
  await waiter.mine(101)
  console.log('✅ Initial funds added.')

  console.log('🎯 Test environment ready.\n')
}
