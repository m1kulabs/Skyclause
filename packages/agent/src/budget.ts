import { z } from 'zod'
import { ProposedBundle } from './schema'

// TRD "Agent evals and budgets": per run, as code constants (§6).
export const INPUT_TOKEN_BUDGET = 32_000
export const OUTPUT_TOKEN_BUDGET = 4_000

// Every token a byte-level BPE or a SentencePiece tokenizer with byte fallback emits covers at least one byte, so UTF-8
// bytes never undercount text. The response schema is sent too, and each message and the request carry a few control
// tokens, so both get an allowance. #149 checks the estimate against the tokens providers report.
const PER_MESSAGE = 16
const FRAMING = 256
const bytes = (text: string) => new TextEncoder().encode(text).length
const SCHEMA_BYTES = bytes(JSON.stringify(z.toJSONSchema(ProposedBundle)))

/** An upper bound on the input tokens of one call, counted before it is made. */
export function estimateInputTokens(call: { instructions: string; messages: string[] }): number {
  const text = [call.instructions, ...call.messages].reduce((sum, part) => sum + bytes(part), 0)
  return text + SCHEMA_BYTES + PER_MESSAGE * (call.messages.length + 1) + FRAMING
}
