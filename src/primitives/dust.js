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

const DUST_RELAY_FEE_RATE = 3n

const OUTPUT_VALUE_BYTES = 8
const OUTPUT_SCRIPT_LENGTH_BYTES = 1

const INPUT_OUTPOINT_BYTES = 32 + 4
const INPUT_SCRIPT_LENGTH_BYTES = 1
const INPUT_SEQUENCE_BYTES = 4
const INPUT_UNLOCK_BYTES = 107

const WITNESS_SCALE_FACTOR = 4

const MIN_WITNESS_PROGRAM_SCRIPT_BYTES = 4
const MAX_WITNESS_PROGRAM_SCRIPT_BYTES = 42
const OP_0 = 0x00
const OP_1 = 0x51
const OP_16 = 0x60

/**
 * @param {Uint8Array} script - The output's scriptPubKey.
 * @returns {boolean} Whether the script is a witness program.
 */
function isWitnessProgram (script) {
  return script.length >= MIN_WITNESS_PROGRAM_SCRIPT_BYTES &&
    script.length <= MAX_WITNESS_PROGRAM_SCRIPT_BYTES &&
    (script[0] === OP_0 || (script[0] >= OP_1 && script[0] <= OP_16)) &&
    script[1] + 2 === script.length
}

/**
 * Returns the dust limit of an output: the value below which the output costs more to spend than the dust relay fee rate allows.
 *
 * Follows Bitcoin Core's `GetDustThreshold`. The size is the serialized output plus the input that would spend it, which is estimated
 * as a single-signature spend, with the witness discount applied to the unlock bytes of witness programs.
 *
 * @param {Uint8Array} script - The output's scriptPubKey.
 * @returns {bigint} The dust limit in satoshis.
 */
export function getDustLimit (script) {
  const outputBytes = OUTPUT_VALUE_BYTES + OUTPUT_SCRIPT_LENGTH_BYTES + script.length

  const unlockBytes = isWitnessProgram(script)
    ? Math.floor(INPUT_UNLOCK_BYTES / WITNESS_SCALE_FACTOR)
    : INPUT_UNLOCK_BYTES

  const inputBytes = INPUT_OUTPOINT_BYTES + INPUT_SCRIPT_LENGTH_BYTES + unlockBytes + INPUT_SEQUENCE_BYTES

  return DUST_RELAY_FEE_RATE * BigInt(outputBytes + inputBytes)
}
