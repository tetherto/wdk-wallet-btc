import dotenv from 'dotenv'

dotenv.config({ path: './.env.test', quiet: true })

export const HOST = process.env.TEST_HOST || '127.0.0.1'
export const PORT = +process.env.TEST_BITCOIN_CLI_PORT || 18_443
export const ELECTRUM_PORT = +process.env.TEST_ELECTRUM_PORT || 7_777
export const ZMQ_PORT = +process.env.TEST_ZMQ_PORT || 29_000
export const DATA_DIR = process.env.TEST_BITCOIN_CLI_DATA_DIR || './.bitcoin'
