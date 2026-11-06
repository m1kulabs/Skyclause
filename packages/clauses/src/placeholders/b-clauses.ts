import { notBuilt } from '../not-built'
import type { CanonicalHash, Check, DeriveInputState, Diff, Evaluate, Explain, SnapshotAt } from '../types'

export const snapshotAt: SnapshotAt = notBuilt('b-clauses')
export const check: Check = notBuilt('b-clauses')
export const evaluate: Evaluate = notBuilt('b-clauses')
export const explain: Explain = notBuilt('b-clauses')
export const canonicalHash: CanonicalHash = notBuilt('b-clauses')
export const diff: Diff = notBuilt('b-clauses')
export const deriveInputState: DeriveInputState = notBuilt('b-clauses')
