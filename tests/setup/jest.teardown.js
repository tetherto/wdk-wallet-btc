import { execSync } from 'child_process'
import { DATA_DIR, HOST, ELECTRUM_PORT, ZMQ_PORT, RPC_PORT } from '../config.js'
import { BitcoinCli, Waiter } from '../helpers/index.js'

const waiter = new Waiter(DATA_DIR, HOST, ZMQ_PORT, ELECTRUM_PORT)
const btc = new BitcoinCli(DATA_DIR, HOST, ZMQ_PORT, RPC_PORT, null)

export default async () => {
  console.log('\n🧹 [Test Teardown] Tearing down test environment...')

  try {
    console.log('⛔ Stopping bitcoind...')
    btc.stop()
    await waiter.waitUntilRpcStopped()
    console.log('✅ bitcoind stopped.')
  } catch {
    console.log('⚠️ bitcoind was not running or already stopped.')
  }

  console.log('🔌 Waiting for Electrum server to fail...')
  try {
    await waiter.waitUntilPortClosed(HOST, ELECTRUM_PORT)
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
