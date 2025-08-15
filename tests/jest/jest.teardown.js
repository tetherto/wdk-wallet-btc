import { execSync } from 'child_process'
import { platform } from 'os'

import { HOST, PORT, ELECTRUM_PORT, ZMQ_PORT, DATA_DIR } from '../config.js'

import { BitcoinCli, Waiter } from '../helpers/index.js'

const isWindows = platform() === 'win32'

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

export default async () => {
  console.log('\n🧹 [Test Teardown] Tearing down test environment...')

  console.log('⛔ Stopping bitcoind...')

  try {
    bitcoin.stop()
    await waiter.waitUntilBitcoinCoreIsStopped()
    console.log('✅ bitcoind stopped.')
  } catch {
    console.warn('⚠️  bitcoind was not running or already stopped.')
  }

  console.log('🔌 Waiting for Electrum server to fail...')

  try {
    await waiter.waitUntilPortIsClosed(HOST, ELECTRUM_PORT)
    console.log('✅ Electrum server stopped.')
  } catch {
    console.warn('⚠️  Electrum server did not exit in time.')
  }

  console.log('🗑️ Removing regtest chain data...')

  try {
    if (isWindows) {
      execSync('if exist ".\\db" rmdir /s /q ".\\db"', { stdio: 'ignore' })
    } else {
      execSync('rm -rf ./db', { stdio: 'ignore' })
    }
    console.log('✅ Database files removed.')
  } catch {
    console.warn('⚠️  Failed to remove database files.')
  }

  try {
    if (isWindows) {
      execSync(`if exist "${DATA_DIR}" rmdir /s /q "${DATA_DIR}"`, { stdio: 'ignore' })
    } else {
      execSync(`rm -rf ${DATA_DIR}`, { stdio: 'ignore' })
    }
    console.log('✅ Chain data removed.')
  } catch {
    console.warn('⚠️  Failed to remove chain data.')
  }

  console.log('🏁 Teardown complete.')
}
