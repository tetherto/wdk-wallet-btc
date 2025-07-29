import fs from 'fs'
import path from 'path'
import { execSync, spawn } from 'child_process'

import { HOST, PORT, ELECTRUM_PORT, ZMQ_PORT, DATA_DIR } from '../config.js'

import { BitcoinCli, Waiter } from '../helpers/index.js'

const BITCOIN_CORE_VERSION = 'v28.'

const ELECTRS_VERSION = 'v0.10.'

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
  zmqPort: ZMQ_PORT
})

function checkBitcoinCore () {
  try {
    const buffer = execSync('bitcoind --version', { stdio: ['inherit', 'pipe', 'ignore'] })
    const output = buffer.toString()
    return output.includes(BITCOIN_CORE_VERSION)
  } catch {
    return false
  }
}

function checkElectrs () {
  try {
    const buffer = execSync('electrs --version', { stdio: ['inherit', 'pipe', 'ignore'] })
    const output = buffer.toString()
    return output.includes(ELECTRS_VERSION)
  } catch {
    return false
  }
}

export default async () => {
  console.log('\n🧪 [Test Setup] Initializing Bitcoin regtest environment...')

  if (!checkBitcoinCore() || !checkElectrs()) {
    console.error('❗ You are missing the following tools:')
    console.error(`${checkBitcoinCore() ? '✅' : '❌'} Bitcoin Core\tv28.x.x+ - install here: https://bitcoin.org/en/download`)
    console.error(`${checkElectrs() ? '✅' : '❌'} Electrs\tv0.10.x+ - install here: https://github.com/romanz/electrs/blob/master/doc/install.md`)

    process.exit(1)
  }

  const envTestPath = path.resolve('.env.test')

  if (!fs.existsSync(envTestPath)) {
    console.warn('⚠️ No .env.test file found. Proceeding with default configuration values...')
  }

  try {
    console.log('⛔ Stopping any previously running bitcoind instance...')
    bitcoin.stop()
  } catch {
    console.warn('⚠️ No previous bitcoind instance was running.')
  }

  console.log('🧹 Removing old regtest data...')
  execSync(`rm -rf ${DATA_DIR}/regtest`, { stdio: 'ignore' })

  console.log(`📁 Ensuring data directory exists at ${DATA_DIR}...`)
  execSync(`mkdir -p ${DATA_DIR}`, { stdio: 'ignore' })

  try {
    console.log(`🔍 Checking for processes using port ${PORT}...`)
    execSync(`lsof -i :${PORT} | grep LISTEN | awk '{print $2}' | xargs kill -9`, { stdio: 'ignore' })
    console.log(`✅ Killed process on port ${PORT}.`)
  } catch {
    console.warn(`⚠️ No process was using port ${PORT}.`)
  }

  console.log('🚀 Starting bitcoind in regtest mode...')
  bitcoin.start()
  await waiter.waitUntilPortIsOpen(HOST, PORT)
  console.log('✅ bitcoind started.')

  console.log('🔌 Starting Electrum server...')
  spawn('electrs', [
    '--network', 'regtest',
    '--daemon-dir', DATA_DIR,
    '--electrum-rpc-addr', `${HOST}:${ELECTRUM_PORT}`
  ])

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
