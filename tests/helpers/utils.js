import { vsize } from '@bitcoinerlab/coinselect'
import { Transaction } from 'bitcoinjs-lib'

import { Output } from '../../src/crypto-engine.js'
import { getAddressDescriptor } from '../../src/primitives/descriptor.js'

/**
 * Computes the fee of a sweep: `inputCount` inputs of the `from` address type, a single `to` output and no change.
 *
 * @param {Object} sweep
 * @param {string} sweep.from - The sender's address.
 * @param {string} sweep.to - The recipient's address.
 * @param {Object} sweep.network - The network.
 * @param {number} [sweep.inputCount] - The number of inputs.
 * @param {number} [sweep.feeRate] - The fee rate (in sats/vB).
 * @returns {bigint} The fee in satoshis.
 */
export function sweepFee ({ from, to, network, inputCount = 1, feeRate = 1 }) {
  const outputOf = (address) => new Output({ descriptor: getAddressDescriptor(address), network })
  const inputs = Array.from({ length: inputCount }, () => outputOf(from))

  return BigInt(Math.ceil(vsize(inputs, [outputOf(to)]) * feeRate))
}

/**
 * Polls until the condition returns true.
 *
 * @param {() => boolean | Promise<boolean>} condition - The condition to wait for.
 * @param {Object} [opts] - The options.
 * @param {number} [opts.timeout] - The maximum wait in milliseconds.
 * @param {number} [opts.interval] - The polling interval in milliseconds.
 * @returns {Promise<void>}
 */
export async function waitUntil (condition, { timeout = 15_000, interval = 250 } = {}) {
  const start = Date.now()

  while (Date.now() - start < timeout) {
    if (await condition()) return

    await new Promise(resolve => setTimeout(resolve, interval))
  }

  throw new Error('Timed out waiting for the condition.')
}

/**
 * Builds a previous transaction with a single output, so that its id matches the hex it is served with.
 *
 * @param {Object} prevTx
 * @param {Uint8Array} prevTx.script - The output script.
 * @param {number | bigint} prevTx.value - The output value (in satoshis).
 * @param {number} [prevTx.index] - Makes the transaction, and so its id, unique.
 * @returns {{ txid: string, hex: string }} The transaction's id and raw hex.
 */
export function createPrevTx ({ script, value, index = 0 }) {
  const tx = new Transaction()

  tx.addInput(Buffer.alloc(32, index + 1), 0)
  tx.addOutput(script, BigInt(value))

  return { txid: tx.getId(), hex: tx.toHex() }
}
