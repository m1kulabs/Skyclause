import { canonicalHash } from './canonical-hash'
import type { Clause, Diff, SheetDiff, SheetInput } from './types'

function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export const diff: Diff = (before: SheetInput, after: SheetInput): SheetDiff => {
  const beforeMap = new Map<string, Clause>()
  for (const c of before.clauses) {
    beforeMap.set(c.key, c)
  }

  const afterMap = new Map<string, Clause>()
  for (const c of after.clauses) {
    afterMap.set(c.key, c)
  }

  const orderedKeys: string[] = []
  const seen = new Set<string>()
  for (const c of before.clauses) {
    if (!seen.has(c.key)) {
      seen.add(c.key)
      orderedKeys.push(c.key)
    }
  }
  for (const c of after.clauses) {
    if (!seen.has(c.key)) {
      seen.add(c.key)
      orderedKeys.push(c.key)
    }
  }

  const changes: SheetDiff = []
  for (const key of orderedKeys) {
    const b = beforeMap.get(key) ?? null
    const a = afterMap.get(key) ?? null
    if (b === null && a !== null) {
      changes.push({ key, before: null, after: a })
    } else if (b !== null && a === null) {
      changes.push({ key, before: b, after: null })
    } else if (b !== null && a !== null && canonicalHash(stripUndefined(b)) !== canonicalHash(stripUndefined(a))) {
      changes.push({ key, before: b, after: a })
    }
  }

  return changes
}
