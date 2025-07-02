import 'dotenv/config'
import { execSync } from 'child_process'

const DATA_DIR = process.env.DATA_DIR || `${process.env.HOME}/.bitcoin`

export default async () => {
  console.log('\n🧹 [Test Teardown] Tearing down test environment...')


  try {
    console.log('⛔ Stopping bitcoind...')
    execSync(`bitcoin-cli -regtest -datadir=${DATA_DIR} stop`)
    console.log('✅ bitcoind stopped.')
  } catch {
    console.log('⚠️ bitcoind was not running or already stopped.')
  }

  console.log('🔌 Electrum server will automatically fail...')


  try {
    console.log('🗑️ Removing regtest chain data...')
    execSync(`rm -rf ${DATA_DIR}`)
    console.log('✅ Chain data removed.')
  } catch {
    console.log('⚠️ Failed to remove chain data.')
  }

  console.log('🏁 Teardown complete.\n')
}
