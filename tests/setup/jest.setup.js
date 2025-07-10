import { spawn, execSync } from 'child_process'
import { DATA_DIR, HOST, ELECTRUM_PORT, ZMQ_PORT, RPC_PORT } from '../config.js'
import { BitcoinCli, Waiter } from '../helpers/index.js'

const waiter = new Waiter(DATA_DIR, HOST, ZMQ_PORT, ELECTRUM_PORT)
const btc = new BitcoinCli(DATA_DIR, HOST, ZMQ_PORT, RPC_PORT)

export default async () => {
  console.log('\n🧪 [Test Setup] Initializing Bitcoin regtest environment...')

  try {
    console.log('⛔ Stopping any previously running bitcoind instance...')
    btc.stop()
  } catch {
    console.log('⚠️ No previous bitcoind instance was running.')
  }

  console.log('🧹 Removing old regtest data...')
  execSync(`rm -rf ${DATA_DIR}/regtest`)

  console.log(`📁 Ensuring data directory exists at ${DATA_DIR}...`)
  execSync(`mkdir -p ${DATA_DIR}`)

  try {
    console.log(`🔍 Checking for processes using port ${RPC_PORT}...`)
    execSync(`lsof -i :${RPC_PORT} | grep LISTEN | awk '{print $2}' | xargs kill -9`)
    console.log(`✅ Killed process on port ${RPC_PORT}.`)
  } catch {
    console.log(`⚠️ No process was using port ${RPC_PORT}.`)
  }

  console.log('🚀 Starting bitcoind in regtest mode...')
  btc.start()
  await waiter.waitUntilRpcReady()
  console.log('✅ bitcoind started.')

  console.log('🔌 Starting Electrum server...')
  spawn('electrs', [
    '--network', 'regtest',
    '--daemon-dir', DATA_DIR,
    '--electrum-rpc-addr', `${HOST}:${ELECTRUM_PORT}`
  ], { stdio: 'ignore' })

  await waiter.waitUntilPortOpen(HOST, ELECTRUM_PORT)
  console.log('✅ Electrum server is running.')

  console.log('💼 Creating new wallet `testwallet`...')
  btc.call('createwallet testwallet')
  btc.setWallet('testwallet')

  console.log('⛏️ Mining 101 blocks for initial funds...')
  const minerAddr = btc.call('getnewaddress')
  const blocksPromise = waiter.waitForBlocks(101)
  btc.call(`generatetoaddress 101 ${minerAddr}`)
  await blocksPromise
  console.log('✅ Initial funds added.')

  console.log('🎯 Test environment ready.\n')
}
