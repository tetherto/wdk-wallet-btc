import 'dotenv/config'
import { execSync } from 'child_process'
import Waiter from '../helpers/waiter.js'

const DATA_DIR = process.env.TEST_BITCOIN_CLI_DATA_DIR || `${process.env.HOME}/.bitcoin`
const HOST = process.env.TEST_ELECTRUM_SERVER_HOST || '127.0.0.1'
const PORT = process.env.TEST_ELECTRUM_SERVER_PORT || '7777'
const PORT_NUM = parseInt(PORT, 10)
const ZMQ_PORT = process.env.TEST_BITCOIN_ZMQ_PORT || '29000'

const waiter = new Waiter(DATA_DIR, HOST, ZMQ_PORT)

export default async () => {
  console.log('\n🧹 [Test Teardown] Tearing down test environment...')

  try {
    console.log('⛔ Stopping bitcoind...')
    execSync(`bitcoin-cli -regtest -datadir=${DATA_DIR} stop`)
    await waiter.waitUntilRpcStopped()
    console.log('✅ bitcoind stopped.')
  } catch {
    console.log('⚠️ bitcoind was not running or already stopped.')
  }

  console.log('🔌 Waiting for Electrum server to fail...')
  try {
    await waiter.waitUntilPortClosed(HOST, PORT_NUM)
    console.log('✅ Electrum server stopped.')
  } catch {
    console.log('⚠️ Electrum server did not exit in time.')
  }

  try {
    console.log('🗑️ Removing regtest chain data...')
    execSync(`rm -rf ${DATA_DIR}`)
    console.log('✅ Chain data removed.')
  } catch {
    console.log('⚠️ Failed to remove chain data.')
  }

  console.log('🏁 Teardown complete.\n')
}
