import { check as checkImpl } from '../check'
import { diff as diffImpl } from '../diff'
import { evaluate as evaluateImpl, explain as explainImpl } from '../evaluate'
import { deriveInputState as deriveInputStateImpl, snapshotAt as snapshotAtImpl } from '../snapshot'
import type { Check, DeriveInputState, Diff, Evaluate, Explain, SnapshotAt } from '../types'

export { canonicalHash, canonicalJson } from '../canonical-hash'
export { effectiveSpan, parseSpanRef, type ParsedSpanRef } from '../span'

export const snapshotAt: SnapshotAt = snapshotAtImpl
export const check: Check = checkImpl
export const evaluate: Evaluate = evaluateImpl
export const explain: Explain = explainImpl
export const diff: Diff = diffImpl
export const deriveInputState: DeriveInputState = deriveInputStateImpl
