import { execSync, spawn, exec } from 'child_process'
import { platform } from 'os'

import { HOST, PORT, ELECTRUM_PORT, ZMQ_PORT, DATA_DIR } from '../config.js'

import { BitcoinCli, Waiter } from '../helpers/index.js'

const BITCOIN_CORE_VERSION = 'v28.'

const ELECTRS_VERSION = 'v0.10.'

const WSL_VERSION = 2

const isWindows = platform() === 'win32'

// Function to kill port conflicts
async function killPortConflicts () {
  console.log('🔍 Checking for port conflicts...')

  try {
    if (isWindows) {
      // Kill anything using the P2P port (18445) and RPC port
      try {
        // Kill processes on P2P port 18445
        execSync('wsl netstat -tulpn | grep :18445 | awk \'{print $7}\' | cut -d\'/\' -f1 | xargs -r kill -9', { stdio: 'ignore' })
        console.log('✅ Killed processes on P2P port 18445')
      } catch (error) {
        console.log('ℹ️ No processes on P2P port 18445')
      }

      // Kill processes on RPC port
      try {
        execSync(`wsl netstat -tulpn | grep :${PORT} | awk '{print $7}' | cut -d'/' -f1 | xargs -r kill -9`, { stdio: 'ignore' })
        console.log(`✅ Killed processes on RPC port ${PORT}`)
      } catch (error) {
        console.log(`ℹ️ No processes on RPC port ${PORT}`)
      }

      // Kill processes on Electrum port
      try {
        execSync(`wsl netstat -tulpn | grep :${ELECTRUM_PORT} | awk '{print $7}' | cut -d'/' -f1 | xargs -r kill -9`, { stdio: 'ignore' })
        console.log(`✅ Killed processes on Electrum port ${ELECTRUM_PORT}`)
      } catch (error) {
        console.log(`ℹ️ No processes on Electrum port ${ELECTRUM_PORT}`)
      }

      // Also kill any bitcoind and electrs processes
      try {
        execSync('wsl pkill -9 -f bitcoind', { stdio: 'ignore' })
        console.log('✅ Killed all bitcoind processes')
      } catch (error) {
        console.log('ℹ️ No bitcoind processes to kill')
      }

      try {
        execSync('wsl pkill -9 -f electrs', { stdio: 'ignore' })
        console.log('✅ Killed all electrs processes')
      } catch (error) {
        console.log('ℹ️ No electrs processes to kill')
      }
    } else {
      // Unix systems
      try {
        execSync('lsof -ti:18445 | xargs kill -9', { stdio: 'ignore' })
        console.log('✅ Killed processes on P2P port 18445')
      } catch (error) {
        console.log('ℹ️ No processes on P2P port 18445')
      }

      try {
        execSync(`lsof -ti:${PORT} | xargs kill -9`, { stdio: 'ignore' })
        console.log(`✅ Killed processes on RPC port ${PORT}`)
      } catch (error) {
        console.log(`ℹ️ No processes on RPC port ${PORT}`)
      }

      try {
        execSync(`lsof -ti:${ELECTRUM_PORT} | xargs kill -9`, { stdio: 'ignore' })
        console.log(`✅ Killed processes on Electrum port ${ELECTRUM_PORT}`)
      } catch (error) {
        console.log(`ℹ️ No processes on Electrum port ${ELECTRUM_PORT}`)
      }

      try {
        execSync('pkill -9 -f bitcoind', { stdio: 'ignore' })
        console.log('✅ Killed all bitcoind processes')
      } catch (error) {
        console.log('ℹ️ No bitcoind processes to kill')
      }

      try {
        execSync('pkill -9 -f electrs', { stdio: 'ignore' })
        console.log('✅ Killed all electrs processes')
      } catch (error) {
        console.log('ℹ️ No electrs processes to kill')
      }
    }

    // Wait for ports to be freed
    console.log('⏳ Waiting for ports to be freed...')
    await new Promise(resolve => setTimeout(resolve, 5000))
    console.log('✅ Port conflict check complete')
  } catch (error) {
    console.warn('⚠️ Error during port conflict check:', error.message)
  }
}

const bitcoin = new BitcoinCli({
  host: HOST,
  port: PORT,
  electrumPort: ELECTRUM_PORT,
  zmqPort: ZMQ_PORT,
  dataDir: DATA_DIR
})

const waiter = new Waiter(bitcoin, {
  host: HOST,
  electrumPort: ELECTRUM_PORT,
  zmqPort: ZMQ_PORT,
  timeout: 100000
})

function checkBitcoinCore () {
  try {
    const buffer = execSync('bitcoind --version', { stdio: ['inherit', 'pipe', 'ignore'] })
    const output = buffer.toString()
    
    const versionMatch = output.match(/Bitcoin Core version v(\d+)\.(\d+)\.(\d+)/)
    if (versionMatch) {
      const major = parseInt(versionMatch[1])
      const minor = parseInt(versionMatch[2])
      
      if (major > 28 || (major === 28 && minor >= 0)) {
        return true
      } else {
        return false
      }
    }
    return false
  } catch {
    return false
  }
}

function checkElectrs () {
  try {
    const buffer = execSync('electrs --version', { stdio: ['inherit', 'pipe', 'ignore'] })
    const output = buffer.toString()
    
    const versionMatch = output.match(/v(\d+)\.(\d+)\.(\d+)/)
    if (versionMatch) {
      const major = parseInt(versionMatch[1])
      const minor = parseInt(versionMatch[2])
      
      if (major > 0 || (major === 0 && minor >= 10)) {
        return true
      } else {
        return false
      }
    }
    return false
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

  // Debug: Show working directory and DATA_DIR
  console.log(`🔍 Debug: process.cwd(): ${process.cwd()}`)
  console.log(`🔍 Debug: DATA_DIR: ${DATA_DIR}`)
  console.log(`🔍 Debug: __dirname equivalent: ${import.meta.url}`)
  console.log(`🔍 Debug: HOST: ${HOST}`)
  console.log(`🔍 Debug: PORT: ${PORT}`)

  if (isWindows && !checkWSL()) {
    console.error('❗ You are missing the following tools:')
    console.error(`❌ WSL - install here: https://learn.microsoft.com/en-us/windows/wsl/install`)
    process.exit(1)
  }

  if (!checkBitcoinCore() || !checkElectrs()) {
    console.error('❗ You are missing the following tools:')
    console.error(`${checkBitcoinCore() ? '✅' : '❌'} Bitcoin Core\tv28.x.x+ - install here: https://bitcoin.org/en/download`)
    console.error(`${checkElectrs() ? '✅' : '❌'} Electrs\tv0.10.x+ - install here: https://github.com/romanz/electrs/blob/master/doc/install.md`)

    process.exit(1)
  }

  // Kill any port conflicts before starting
  await killPortConflicts()

  try {
    console.log('⛔ Stopping any previously running bitcoind instance...')
    bitcoin.stop()
  } catch {
    console.warn('⚠️ No previous bitcoind instance was running.')
  }

  console.log('🧹 Removing old regtest data...')
  if (isWindows) {
    // On Windows, use WSL home directory to avoid permission issues
    const wslUsername = execSync('wsl whoami', { stdio: 'pipe' }).toString().trim()
    const wslDataDir = `/home/${wslUsername}/${DATA_DIR}`

    // Try to remove regtest directory, ignore errors if it doesn't exist
    try {
      execSync(`wsl rm -rf ${wslDataDir}/regtest`, { stdio: 'ignore' })
      console.log('✅ Removed old regtest data')
    } catch (error) {
      // Ignore errors - directory might not exist
      console.log('ℹ️ No old regtest data to remove')
    }
  } else {
    execSync(`rm -rf ${DATA_DIR}/regtest`, { stdio: 'ignore' })
  }

  console.log(`📁 Ensuring data directory exists at ${DATA_DIR}...`)
  if (isWindows) {
    // On Windows, create directory directly in WSL home directory to avoid permission issues
    // Get the WSL username dynamically
    const wslUsername = execSync('wsl whoami', { stdio: 'pipe' }).toString().trim()
    const wslDataDir = `/home/${wslUsername}/${DATA_DIR}`
    console.log(`🔍 Debug: Creating WSL directory: ${wslDataDir}`)

    // Create the directory directly in WSL home
    try {
      execSync(`wsl mkdir -p ${wslDataDir}`, { stdio: 'ignore' })
      console.log(`✅ Created WSL directory: ${wslDataDir}`)

      // Verify the directory was created and show its permissions
      try {
        const permissions = execSync(`wsl ls -la ${wslDataDir}`, { stdio: 'pipe' }).toString()
        console.log('✅ WSL directory permissions:')
        console.log(permissions)
      } catch (permError) {
        console.warn(`⚠️ Could not verify WSL permissions: ${permError.message}`)
      }
    } catch (error) {
      console.error(`❌ Failed to create WSL directory: ${wslDataDir}`)
      console.error(`   Error: ${error.message}`)
      throw error
    }
  } else {
    execSync(`mkdir -p ${DATA_DIR}`, { stdio: 'ignore' })
  }

  console.log('🚀 Starting bitcoind in regtest mode...')
  bitcoin.start()
  console.log('⏳ Waiting for bitcoind to be ready...')
  await waiter.waitUntilBitcoinCoreIsStarted()
  console.log('✅ bitcoind started.')

  // Wait for Bitcoin Core RPC port to be open before starting Electrs
  console.log('⏳ Waiting for Bitcoin Core RPC to be ready...')
  await waiter.waitUntilPortIsOpen(HOST, PORT)
  console.log('✅ Bitcoin Core RPC is ready.')

  console.log('🔌 Starting Electrum server...')

  // On Windows, use WSL home directory for consistency
  if (isWindows) {
    const wslUsername = execSync('wsl whoami', { stdio: 'pipe' }).toString().trim()
    const wslDataDir = `/home/${wslUsername}/${DATA_DIR}`
    // Use exec with callback like the working bitcoind pattern
    exec('electrs --network regtest --daemon-dir ' + wslDataDir + ' --daemon-rpc-addr ' + HOST + ':' + PORT + ' --electrum-rpc-addr ' + HOST + ':' + ELECTRUM_PORT, {
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
      '--daemon-dir', DATA_DIR,
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
