import type { Verdict } from '@skyclause/clauses'

/** Display meaning only: evidence and hashes can change while the decision stays the same. */
export function semanticVerdictKey(verdict: Verdict): string {
  return JSON.stringify({
    mode: verdict.mode,
    watch: verdict.watch,
    noCall: verdict.noCall === null ? null : [...new Set(verdict.noCall.inputs.map((input) => input.name))].sort(),
    recommendations: [...new Set(verdict.recommendations)].sort()
  })
}
