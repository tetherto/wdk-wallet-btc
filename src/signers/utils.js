'use strict'

import { crypto, payments, Transaction } from 'bitcoinjs-lib'

export function hashMessage (message) {
  return crypto.sha256(Buffer.from(message, 'utf8'))
}

export function buildPaymentScript (bip, pubkey, network) {
  const payment = bip === 84
    ? payments.p2wpkh({ pubkey, network })
    : payments.p2pkh({ pubkey, network })
  return payment.output
}

export function detectInputOwnership (psbtInstance, i, myScript) {
  const input = psbtInstance.data.inputs[i] || {}
  const txIn = psbtInstance.txInputs[i]
  let prevOut = null
  let isOurs = false

  try {
    if (input.nonWitnessUtxo) {
      const prevTx = Transaction.fromBuffer(input.nonWitnessUtxo)
      prevOut = prevTx.outs[txIn.index]
      isOurs = !!(prevOut && prevOut.script && myScript && prevOut.script.equals(myScript))
    } else if (input.witnessUtxo) {
      prevOut = input.witnessUtxo
      isOurs = !!(prevOut && prevOut.script && myScript && prevOut.script.equals(myScript))
    }
  } catch (err) {
    isOurs = false
  }

  return { input, prevOut, isOurs }
}

export function ensureWitnessUtxoIfNeeded (psbtInstance, i, bip, prevOut, input) {
  try {
    if (bip === 84 && prevOut && prevOut.script && typeof prevOut.value === 'number' && !input.witnessUtxo) {
      psbtInstance.updateInput(i, {
        witnessUtxo: {
          script: prevOut.script,
          value: prevOut.value
        }
      })
    }
  } catch (err) {
    // ignore if cannot set
  }
}

export function normalizeConfig (config = {}) {
  const bip = config.bip ?? 44
  if (![44, 84].includes(bip)) {
    throw new Error('Invalid bip specification. Supported bips: 44, 84.')
  }
  return { ...config, bip }
}

export function getAddressFromPublicKey (publicKey, network, bip = 44) {
  const { address } = bip === 44
    ? payments.p2pkh({ pubkey: publicKey, network })
    : payments.p2wpkh({ pubkey: publicKey, network })
  return address
}
