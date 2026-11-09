import { canonicalHash } from './canonical-hash'
import { buildTypeEnv, checkCelCondition } from './cel'
import { validateSpan } from './span'
import { WORDING_FIELDS } from './types'
import type { Check, CheckedSheet, CheckIssue, IndicatorRegistry, SheetInput } from './types'

const TEACHING_LINE = "Teaching mode is the lecturer's and the university's decision"
const VALID_WORDING_FIELDS = new Set<string>(WORDING_FIELDS)

function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export const check: Check = (sheet: SheetInput, registry: IndicatorRegistry) => {
  const hardIssues: CheckIssue[] = []
  const publishIssues: CheckIssue[] = []
  const typeEnv = buildTypeEnv(registry)
  const seenKeys = new Set<string>()

  for (const clause of sheet.clauses) {
    if (!clause.key || !clause.key.trim()) {
      hardIssues.push({
        clauseKey: null,
        message: 'Clause key cannot be empty',
        offset: 0,
        length: 1
      })
    } else if (seenKeys.has(clause.key)) {
      hardIssues.push({
        clauseKey: clause.key,
        message: `Duplicate clause key '${clause.key}'`,
        offset: 0,
        length: clause.key.length
      })
    } else {
      seenKeys.add(clause.key)
    }

    const declaredDeps = new Set<string>([...clause.requires, ...(clause.optional ?? [])])

    for (const dep of declaredDeps) {
      const def = typeEnv.get(dep)
      if (!def) {
        hardIssues.push({
          clauseKey: clause.key,
          message: `Unknown indicator '${dep}' in requires/optional`,
          offset: 0,
          length: dep.length
        })
      } else if (def.scope === 'window' && clause.scope !== 'window') {
        hardIssues.push({
          clauseKey: clause.key,
          message: `Window-scoped indicator '${dep}' cannot be used in a '${clause.scope}' clause`,
          offset: 0,
          length: dep.length
        })
      }
    }

    if (clause.span) {
      if (clause.scope !== 'window') {
        hardIssues.push({
          clauseKey: clause.key,
          message: `Span is only valid on window-scoped clauses, got '${clause.scope}'`,
          offset: 0,
          length: clause.span.from.length + clause.span.to.length
        })
      } else {
        const spanCheck = validateSpan(clause.span)
        if (!spanCheck.ok) {
          hardIssues.push({
            clauseKey: clause.key,
            message: spanCheck.message,
            offset: 0,
            length: Math.max(1, clause.span.from.length)
          })
        }
      }
    }

    const celIssues = checkCelCondition(clause.key, clause.when, clause.scope, declaredDeps, typeEnv)
    hardIssues.push(...celIssues)

    for (const lang of ['en', 'ms'] as const) {
      const text = clause.wording?.[lang]
      if (!text) continue
      for (const match of text.matchAll(/\{([^{}]*)\}/g)) {
        const rawPlaceholder = match[1] ?? ''
        const offset = match.index ?? 0
        const length = match[0].length
        const lastDot = rawPlaceholder.lastIndexOf('.')
        if (lastDot <= 0 || lastDot === rawPlaceholder.length - 1) {
          hardIssues.push({
            clauseKey: clause.key,
            message: `Invalid wording placeholder '${match[0]}'`,
            offset,
            length
          })
          continue
        }
        const indName = rawPlaceholder.slice(0, lastDot)
        const fieldName = rawPlaceholder.slice(lastDot + 1)
        if (!typeEnv.has(indName)) {
          hardIssues.push({
            clauseKey: clause.key,
            message: `Unknown indicator '${indName}' in wording placeholder '${match[0]}'`,
            offset,
            length
          })
        }
        if (!VALID_WORDING_FIELDS.has(fieldName)) {
          hardIssues.push({
            clauseKey: clause.key,
            message: `Unknown wording field '${fieldName}' in placeholder '${match[0]}'`,
            offset,
            length
          })
        }
      }
    }

    if (clause.proposes.mode === 'hybrid_recommended') {
      const enText = clause.wording?.en ?? ''
      if (!enText.includes(TEACHING_LINE)) {
        publishIssues.push({
          clauseKey: clause.key,
          message:
            'Clause proposing hybrid_recommended must include "Teaching mode is the lecturer\'s and the university\'s decision" in wording.en',
          offset: 0,
          length: Math.max(1, enText.length)
        })
      }
    }
  }

  const ok = hardIssues.length === 0
  const publishable = ok && publishIssues.length === 0
  const issues = [...hardIssues, ...publishIssues]

  if (!ok) {
    return {
      ok: false,
      publishable: false,
      issues
    }
  }

  const checkedSheet: CheckedSheet = {
    ...sheet,
    contentHash: canonicalHash(stripUndefined(sheet)),
    registryHash: canonicalHash(stripUndefined(registry))
  }

  return {
    ok: true,
    publishable,
    issues,
    sheet: checkedSheet
  }
}
