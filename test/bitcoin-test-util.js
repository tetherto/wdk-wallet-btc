import 'dotenv/config'
import { execSync, spawn } from 'child_process'
import ElectrumClient from '../src/electrum-client.js'

const DATA_DIR = process.env.TEST_BITCOIN_CLI_DATA_DIR || `${process.env.HOME}/.bitcoin`
const CLI = process.env.TEST_BITCOIN_CLI || 'bitcoin-cli'
const BD = process.env.TEST_BITCOIND || 'bitcoind'
const BCLI = `${CLI} -rpcuser=user -rpcpassword=password  -regtest -datadir=${DATA_DIR} -rpcwallet=testwallet`

const electrumConf = {
  host: process.env.TEST_ELECTRUM_SERVER_HOST,
  port: process.env.TEST_ELECTRUM_SERVER_PORT
}

const electrum = new ElectrumClient({
  host: electrumConf.host,
  port: electrumConf.port,
  network: 'bitcoin'
})

export async function callBitcoin (cmd) {
  let res
  try {
    res = (execSync(`${BCLI} ${cmd}`)).toString()
  } catch (_) {
  }
  let data
  try {
    data = JSON.parse(res)
    return data
  } catch (e) {
    // console.log('---')
    // console.log(`Bitcoin CLI: ${cmd}`)
    // console.log(`:>`, res)
    // console.log('---')
  }

  return res
}

export async function currentElectrumBlock () {
  return electrum.getCurrentBlockHeight()
}

export async function getTransaction (txid) {
  return electrum.getTransaction(txid)
}

export async function mineBlock (minerAddr) {
  callBitcoin(`generatetoaddress 1 ${minerAddr}`)

  // confirm that electrum has synced with bitcoin
  for (let x = 0; x <= 10; x++) {
    const chain = await callBitcoin('getblockchaininfo')
    const electrumBlock = await currentElectrumBlock()
    if (chain.blocks === electrumBlock) break
    await new Promise(r => setTimeout(r, 1000))
  }
}

async function isElectrumRunning (host, port) {
  if (!electrum.isConnected()) {
    await electrum.connect()
  }
  const isConnected = electrum.isConnected()
  if (!isConnected) throw new Error('electrum is not connected')
  const block = await electrum.getCurrentBlockHeight()
  if (block <= 0) throw new Error('electrum not ready')
}

let btcProc
function startBitcoinCore () {
  console.log(`Starting process: ${BD}`)
  console.log(`Data directory: ${DATA_DIR}`)

  const args = [
    '-regtest',
    '-daemon',
    '-txindex=1',
    '-fallbackfee=0.0002',
    '-server=1',
    '-rpcuser=user',
    '-rpcpassword=password',
    '-minrelaytxfee=0.00000100',
        `-datadir=${DATA_DIR}`
  ]

  const child = spawn(BD, args, {
    stdio: 'inherit',
    shell: false
  })

  child.on('close', (code) => {
    console.log(`Child process closed with code ${code}`)
    if (code !== 0) {
      const errorMessage = `Process "${BD}" stopped unexpectedly with exit code ${code}.`
      console.error(errorMessage)
      throw new Error(errorMessage)
    } else {
      console.log(`Process "${BD}" exited cleanly.`)
    }
  })

  child.on('error', (err) => {
    const errorMessage = `Failed to start or manage process "${BD}": ${err.message}`
    console.error(errorMessage)
    throw new Error(errorMessage)
  })

  console.log(`Process "${BD}" (PID: ${child.pid}) started.`)
  btcProc = child
  return child
}

async function runBitcoind () {
  execSync(`rm -rf ${DATA_DIR}`)
  execSync(`mkdir -p ${DATA_DIR}`)

  startBitcoinCore()

  console.log('Checking if bitcoin has started')
  try {
    for (let i = 0; i < 10; i++) {
      try {
        const result = await callBitcoin('getblockchaininfo')
        if (result) {
          if (result.blocks === 0) {
            return result
          }
        }
      } catch (e) {
        // ignore individual call errors
      }
      await new Promise(res => setTimeout(res, 2000))
    }
    throw new Error('Failed to get blockchain info after max retries')
  } catch (err) {
    console.error('bitcoin no started. error:', err)
    throw err
  }
}

export async function startBitcoin () {
  console.log('🚀 Starting bitcoind in regtest mode...')

  await runBitcoind()

  console.log('bitcoind started.')

  console.log('Creating new a wallet...')
  await callBitcoin('createwallet testwallet')
  const mineAddr = (await callBitcoin('getnewaddress')).trim()

  console.log('⛏️ Mining 101 blocks...')
  const mine = await callBitcoin(`generatetoaddress 101 ${mineAddr}`)
  const result = await callBitcoin('getblockchaininfo')
  if (result.blocks !== 101) throw new Error('blockchain state is not ready')

  console.log('Initial funds added.')

  const electrum = execSync('sh ./test/run-electrum.sh &')

  await isElectrumRunning()
  console.log('Electrum is running')

  await callBitcoin(`generatetoaddress 1 ${mineAddr}`)

  return result
}

export async function stopBitcoin () {
  try {
    execSync(`rm -rf ${DATA_DIR}`)
    execSync(`mkdir -p ${DATA_DIR}`)
  } catch {
    console.log('Failed to remove chain data.')
  }

  try {
    btcProc?.kill('SIGTERM')
    await callBitcoin('stop')
    execSync('pkill bitcoin')
  } catch (err) {
    console.log('bitcoind was not running or already stopped.')
  }

  console.log('Teardown complete.\n')
}
