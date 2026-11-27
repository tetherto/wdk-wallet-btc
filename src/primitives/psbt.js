// Copyright 2024 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
'use strict'

import { AssertionError, TransactionError, TransactionErrorReason, ValueError } from '@tetherto/wdk-wallet'
import { coinselect, maxFunds, vsize } from '@bitcoinerlab/coinselect'
import { getDustLimit, MAX_STANDARD_TX_VSIZE } from './dust.js'
import { address as btcAddress, Psbt, Transaction } from 'bitcoinjs-lib'
import { getAddressDescriptor, getScriptType } from './descriptor.js'
import { Output } from '@bitcoinerlab/descriptors'
import { compare, fromHex, toHex } from 'uint8array-tools'

/** @typedef {import('./index.js').Utxo} Utxo */
/** @typedef {import('./index.js').ChainUtxo} ChainUtxo */
/** @typedef {import('./index.js').SpendPlan} SpendPlan */
/** @typedef {import('./index.js').KeyOrigin} KeyOrigin */

/** @typedef {import('@bitcoinerlab/descriptors').OutputInstance} OutputInstance */
/** @typedef {import('bitcoinjs-lib').Network} Network */

/**
 * Builds and returns a fee-aware funding plan for sending a transaction.
 *
 * Uses descriptors + coinselect to choose inputs, at a given feeRate (sats/vB). Returns the selected
 * inputs, the outputs to create and the computed fee as a spend plan.
 *
 * The fee and vsize are estimated by coinselect with a worst-case placeholder signature (72 bytes for ECDSA), so the real
 * signed size does not exceed the estimate for low-S signers. Same approach as Bitcoin Core's `CalculateMaximumSignedTxSize`:
 * https://github.com/bitcoin/bitcoin/blob/master/src/wallet/spend.cpp
 *
 * @param {Object} tx - The transaction.
 * @param {string} tx.fromAddress - The sender's address.
 * @param {Array<{ address: string, value: bigint }>} tx.targets - The recipients' addresses and the amounts to send (in satoshis).
 * @param {number} tx.feeRate - The fee rate (in sats/vB).
 * @param {Network} tx.network - The network.
 * @param {ChainUtxo[]} tx.chainUtxos - The sender's unspent outputs.
 * @returns {SpendPlan} - The spend plan.
 * @throws {ValueError} If there are no targets, or an amount doesn't clear the dust limit.
 * @throws {TransactionError} If the account has no unspent outputs, or its balance doesn't cover the amounts and its fees.
 */
export function planSpend ({ fromAddress, targets, feeRate, network, chainUtxos }) {
  if (targets.length === 0) {
    throw new ValueError('At least one target is required.')
  }

  if (chainUtxos.length === 0) {
    throw new TransactionError('No unspent outputs available.', {
      reason: TransactionErrorReason.INSUFFICIENT_BALANCE
    })
  }

  for (const { address: toAddress, value } of targets) {
    const toAddressScript = btcAddress.toOutputScript(toAddress, network)
    const toAddressDustLimit = getDustLimit(toAddressScript)

    if (value < toAddressDustLimit) {
      throw new ValueError(`The amount must be at least the dust limit (= ${toAddressDustLimit}).`)
    }
  }

  const fromAddressScript = btcAddress.toOutputScript(fromAddress, network)
  const fromAddressOutput = new Output({ descriptor: getAddressDescriptor(fromAddress), network })
  const fromAddressScriptType = getScriptType(fromAddressOutput)

  const targetOutputs = targets.map(({ address: toAddress, value }) => {
    const output = new Output({ descriptor: getAddressDescriptor(toAddress), network })

    return { output, value }
  })

  const candidates = chainUtxos.map(chainUtxo => ({
    output: fromAddressOutput,
    value: chainUtxo.value,
    chainUtxo
  }))

  const result = coinselect({
    utxos: candidates,
    remainder: fromAddressOutput,
    targets: targetOutputs,
    feeRate
  })

  if (!result) {
    throw new TransactionError('Insufficient funds to cover the amounts and the fee.', {
      reason: TransactionErrorReason.INSUFFICIENT_BALANCE
    })
  }

  /** @type {Utxo[]} */
  const inputs = result.utxos.map(({ chainUtxo }) => ({
    ...chainUtxo,
    script: fromAddressScript,
    address: fromAddress,
    scriptType: fromAddressScriptType
  }))

  const total = inputs.reduce((s, u) => s + u.value, 0n)
  const changeValue = total - result.fee - targets.reduce((s, u) => s + u.value, 0n)

  const outputs = targets.map(({ address, value }) => ({ address, value }))

  // coinselect's dust limit is below Core's for some script types (e.g. P2SH, P2TR),
  // so change under Core's limit is not created and is folded into the fee
  if (changeValue < getDustLimit(fromAddressScript)) {
    return {
      inputs,
      outputs,
      fee: result.fee + changeValue,
      feeRate,
      vsize: vsize(result.utxos.map(({ output }) => output), targetOutputs.map(({ output }) => output))
    }
  }

  return {
    inputs,
    outputs: [
      ...outputs,
      { address: fromAddress, value: changeValue, isChange: true }
    ],
    fee: result.fee,
    feeRate,
    vsize: result.vsize
  }
}

/**
 * Builds and returns a fee-aware plan that sends all the sender's funds to a single recipient.
 *
 * Uses coinselect's maxFunds to choose inputs, at a given feeRate (sats/vB), dropping unspent outputs
 * worth less than their own input fee. Returns the selected inputs, the output to create and the
 * computed fee as a spend plan.
 *
 * The fee and vsize are estimated by coinselect with a worst-case placeholder signature (72 bytes for ECDSA), so the real
 * signed size does not exceed the estimate for low-S signers. Same approach as Bitcoin Core's `CalculateMaximumSignedTxSize`:
 * https://github.com/bitcoin/bitcoin/blob/master/src/wallet/spend.cpp
 *
 * @param {Object} tx - The transaction.
 * @param {string} tx.fromAddress - The sender's address.
 * @param {string} tx.toAddress - The recipient's address.
 * @param {number} tx.feeRate - The fee rate (in sats/vB).
 * @param {Network} tx.network - The network.
 * @param {ChainUtxo[]} tx.chainUtxos - The sender's unspent outputs.
 * @returns {SpendPlan} - The spend plan.
 * @throws {ValueError} If the transaction exceeds the maximum standard size.
 * @throws {TransactionError} If the account has no unspent outputs, or its funds after the fee don't clear the recipient's dust limit.
 */
export function planSweep ({ fromAddress, toAddress, feeRate, network, chainUtxos }) {
  if (chainUtxos.length === 0) {
    throw new TransactionError('No unspent outputs available.', {
      reason: TransactionErrorReason.INSUFFICIENT_BALANCE
    })
  }

  const fromAddressScript = btcAddress.toOutputScript(fromAddress, network)
  const fromAddressOutput = new Output({ descriptor: getAddressDescriptor(fromAddress), network })
  const fromAddressScriptType = getScriptType(fromAddressOutput)

  const toAddressOutput = new Output({ descriptor: getAddressDescriptor(toAddress), network })
  const toAddressScript = btcAddress.toOutputScript(toAddress, network)

  const candidates = chainUtxos.map(chainUtxo => ({
    output: fromAddressOutput,
    value: chainUtxo.value,
    chainUtxo
  }))

  const result = maxFunds({
    utxos: candidates,
    remainder: toAddressOutput,
    targets: [],
    feeRate
  })

  if (!result) {
    throw new TransactionError('Insufficient funds to cover the amounts and the fee.', {
      reason: TransactionErrorReason.INSUFFICIENT_BALANCE
    })
  }

  if (result.vsize > MAX_STANDARD_TX_VSIZE) {
    throw new ValueError('The transaction exceeds the maximum standard size.')
  }

  /** @type {Utxo[]} */
  const inputs = result.utxos.map(({ chainUtxo }) => ({
    ...chainUtxo,
    script: fromAddressScript,
    address: fromAddress,
    scriptType: fromAddressScriptType
  }))
  const maxTransferable = inputs.reduce((s, u) => s + u.value, 0n) - result.fee

  // coinselect's dust limit is below Core's for some script types (e.g. P2SH, P2TR),
  // so validate the amount against Core's limit
  if (maxTransferable < getDustLimit(toAddressScript)) {
    throw new TransactionError('Insufficient funds to cover the amounts and the fee.', {
      reason: TransactionErrorReason.INSUFFICIENT_BALANCE
    })
  }

  return {
    inputs,
    outputs: [
      { address: toAddress, value: maxTransferable }
    ],
    fee: result.fee,
    feeRate,
    vsize: result.vsize
  }
}

/**
 * Builds an unsigned PSBT from a spend plan, after verifying its inputs against their
 * previous transactions. Inputs and change outputs carry their key origin when one is given.
 *
 * @param {Object} param
 * @param {SpendPlan} param.plan
 * @param {Network} param.network - The network.
 * @param {{ [txId: string]: string }} param.prevTxs
 * @param {{ [address: string]: KeyOrigin }} [param.keyOrigins] - The key origins by address, attached to the inputs and the change outputs paying those addresses.
 * @throws {AssertionError} If the plan's inputs minus its outputs don't add up to its fee.
 */
export function buildPsbt ({ plan, network, prevTxs, keyOrigins = {} }) {
  verifyUtxos(plan.inputs, prevTxs)

  const psbt = new Psbt({ network })
  const getBip32Derivation = (address) => {
    const origin = keyOrigins[address]

    return origin
      ? { bip32Derivation: [{ masterFingerprint: fromHex(origin.masterFingerprint), path: origin.path, pubkey: origin.pubkey }] }
      : {}
  }

  for (const input of plan.inputs) {
    const baseInput = {
      hash: input.outpoint.txid,
      index: input.outpoint.vout,
      ...getBip32Derivation(input.address)
    }

    if (input.scriptType === 'legacy') {
      psbt.addInput({
        ...baseInput,
        nonWitnessUtxo: fromHex(prevTxs[input.outpoint.txid])
      })
    } else {
      psbt.addInput({
        ...baseInput,
        witnessUtxo: {
          script: input.script,
          value: input.value
        }
      })
    }
  }

  for (const output of plan.outputs) {
    psbt.addOutput({
      address: output.address,
      value: output.value,
      ...(output.isChange && getBip32Derivation(output.address))
    })
  }

  const totalInput = plan.inputs.reduce((sum, { value }) => sum + value, 0n)
  const totalOutput = plan.outputs.reduce((sum, { value }) => sum + value, 0n)

  if (totalInput - totalOutput !== plan.fee) {
    throw new AssertionError('Fee mismatch between the spend plan and the PSBT.')
  }

  return psbt
}

/**
 * Verifies each input's real previous output — fetched from the
 * blockchain — matches what spend planning assumed, rather than trusting the client's
 * `listSpendable` report as-is.
 *
 * @param {Utxo[]} utxos - The selected unspent outputs.
 * @param {{ [txId: string]: string }} prevTxs - The raw hex of the previous transactions, by txid.
 * @throws {ValueError} If a previous transaction is missing.
 * @throws {AssertionError} If a previous transaction's id, script, or value doesn't match what was reported.
 */
export function verifyUtxos (utxos, prevTxs) {
  for (const { outpoint: { txid, vout }, value, script: ownScript } of utxos) {
    const prevHex = prevTxs[txid]

    if (!prevHex) {
      throw new ValueError(`Previous transaction not found for input ${txid}:${vout}.`)
    }

    const prevTx = Transaction.fromHex(prevHex)

    if (prevTx.getId() !== txid) {
      throw new AssertionError(`Previous transaction id mismatch for input ${txid}:${vout}.`)
    }

    const prevOut = prevTx.outs[vout]

    if (!prevOut || compare(prevOut.script, ownScript) !== 0) {
      throw new AssertionError(`Previous output script mismatch for input ${txid}:${vout}.`)
    }

    if (BigInt(prevOut.value) !== value) {
      throw new AssertionError(`Previous output value mismatch for input ${txid}:${vout}.`)
    }
  }
}

/**
 * Computes the fee of a signed transaction from the previous transactions it spends.
 *
 * @param {Transaction} transaction - The decoded signed transaction.
 * @param {{ [txId: string]: string }} prevTxs - The raw hex of the previous transactions, by txid.
 * @returns {bigint} The fee (in satoshis).
 * @throws {ValueError} If a previous transaction is missing.
 * @throws {AssertionError} If a previous transaction's id doesn't match the input that spends it.
 */
export function getSignedTransactionFee (transaction, prevTxs) {
  const totalInput = transaction.ins.reduce((sum, { hash, index }) => {
    const txid = toHex(Uint8Array.from(hash).reverse())
    const prevHex = prevTxs[txid]

    if (!prevHex) {
      throw new ValueError(`Previous transaction not found for input ${txid}:${index}.`)
    }

    const prevTx = Transaction.fromHex(prevHex)

    if (prevTx.getId() !== txid) {
      throw new AssertionError(`Previous transaction id mismatch for input ${txid}:${index}.`)
    }

    return sum + BigInt(prevTx.outs[index].value)
  }, 0n)
  const totalOutput = transaction.outs.reduce((sum, { value }) => sum + BigInt(value), 0n)

  return totalInput - totalOutput
}
