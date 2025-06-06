import 'dotenv/config'
import { execSync, spawn } from 'child_process'

const DATA_DIR = process.env.DATA_DIR || `${process.env.HOME}/.bitcoin`
const HOST = process.env.HOST || '127.0.0.1'
const PORT = process.env.PORT || '7777'

let electrsProcess

export default async () => {
    console.log("\n")
    console.log('🧪 [Test Setup] Initializing Bitcoin regtest environment...')

    try {
    console.log('⛔ Stopping any previously running bitcoind instance...')
    execSync(`bitcoin-cli -regtest -datadir=${DATA_DIR} stop`)
    } catch {
    console.log('⚠️ No previous bitcoind instance was running.')
    }

    console.log('🧹 Removing old regtest data...')
    execSync(`rm -rf ${DATA_DIR}/regtest`)

    console.log(`📁 Ensuring data directory exists at ${DATA_DIR}...`)
    execSync(`mkdir -p ${DATA_DIR}`)

    try {
        console.log('🔍 Checking for processes using port 18443...')
        execSync("lsof -i :18443 | grep LISTEN | awk '{print $2}' | xargs kill -9")
        console.log('✅ Killed process on port 18443.')
    } catch {
        console.log('⚠️ No process was using port 18443.')
    }

    console.log('🚀 Starting bitcoind in regtest mode...')
    execSync(`bitcoind -regtest -daemon \
    -txindex=1 \
    -fallbackfee=0.0002 \
    -server=1 \
    -minrelaytxfee=0.00000100 \
    -datadir=${DATA_DIR}`)

    execSync(`sleep 3`)
    console.log('✅ bitcoind started.')

    console.log('💼 Creating new a wallet...')
    execSync(`bitcoin-cli -regtest -datadir=${DATA_DIR} createwallet testwallet`)

    console.log('⛏️ Mining 101 blocks...')
    const minerAddr = execSync(`bitcoin-cli -regtest -datadir=${DATA_DIR} -rpcwallet=testwallet getnewaddress`)
    .toString()
    .trim()
    execSync(`bitcoin-cli -regtest -datadir=${DATA_DIR} -rpcwallet=testwallet generatetoaddress 101 ${minerAddr}`)

    execSync(`sleep 1.5`)
    console.log('✅ Initial funds added.')

    console.log('🔌 Starting Electrum server...')
    electrsProcess = spawn('electrs', [
    '--network', 'regtest',
    '--daemon-dir', DATA_DIR,
    '--electrum-rpc-addr', `${HOST}:${PORT}`
    ], {
    stdio: 'inherit'
    })

    execSync(`sleep 5`)
    console.log('✅ Electrum server is running.')

    console.log('🎯 Test environment ready.\n')
}
