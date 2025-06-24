import 'dotenv/config'
import { stopBitcoin } from './bitcoin-test-util.js'

export default async () => {
  return stopBitcoin()
}
