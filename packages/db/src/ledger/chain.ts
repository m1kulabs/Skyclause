import { createHash } from 'node:crypto'
import { canonicalJson } from '@skyclause/clauses'

// D11 and the #146 ticket decision: hash = sha256(prev_hash bytes ‖ UTF-8 of JCS({seq, kind, refs, body, at})), hex on
// the wire, `at` as RFC 3339 UTC with milliseconds, and a genesis prev_hash of 32 zero bytes.

export const GENESIS_HASH = '0'.repeat(64)

export interface Hashed {
  prevHash: string
  seq: number
  kind: string
  refs: unknown
  body: unknown
  at: Date
}

/** An entry's hash from its stored fields. */
export function entryHash({ prevHash, seq, kind, refs, body, at }: Hashed): string {
  return createHash('sha256')
    .update(Buffer.from(prevHash, 'hex'))
    .update(canonicalJson({ seq, kind, refs, body, at: at.toISOString() }), 'utf8')
    .digest('hex')
}
