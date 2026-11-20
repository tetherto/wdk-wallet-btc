import { vsize } from '@bitcoinerlab/coinselect'

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
