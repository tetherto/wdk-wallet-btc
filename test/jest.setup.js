import { stopBitcoin, startBitcoin } from './bitcoin-test-util.js'

export default async () => {
  console.log("\n")
  console.log('🧪 [Test Setup] Initializing Bitcoin regtest environment...')


  try {
    console.log('⛔ Stopping any previously running bitcoind instance...')
    await stopBitcoin()
  } catch {
    console.log('⚠️ No previous bitcoind instance was running.')
  }

  await startBitcoin()


  console.log('🎯 Test environment ready.\n')
}
