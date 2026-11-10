import { tests as conformanceSuite } from '@bufbuild/cel-spec/testdata/conformance.js'
import type { SerializedIncrementalTest, SerializedIncrementalTestSuite } from '@bufbuild/cel-spec/testdata/tests.js'
import { describe, expect, test } from 'vitest'
import { check, evaluate } from '../src'
import type { IndicatorSnapshot, SheetInput } from '../src/types'
import { TEST_REGISTRY } from './test-helpers'

function collectSuiteTests(
  suite: SerializedIncrementalTestSuite,
  path: string[] = []
): Array<{ suitePath: string; item: SerializedIncrementalTest }> {
  const currentPath = [...path, suite.name]
  const out: Array<{ suitePath: string; item: SerializedIncrementalTest }> = []
  for (const t of suite.tests ?? []) {
    out.push({ suitePath: currentPath.join('/'), item: t })
  }
  for (const sub of suite.suites ?? []) {
    out.push(...collectSuiteTests(sub, currentPath))
  }
  return out
}

interface RawConformanceOriginal {
  name?: string
  expr?: string
  value?: { boolValue?: boolean }
  typeEnv?: unknown[]
  bindings?: Record<string, unknown>
  container?: string
}

const ALLOWED_SUBSET_SUITES = new Set([
  'conformance/comparisons/eq_literal',
  'conformance/comparisons/ne_literal',
  'conformance/comparisons/lt_literal',
  'conformance/comparisons/gt_literal',
  'conformance/comparisons/lte_literal',
  'conformance/comparisons/gte_literal',
  'conformance/logic/AND',
  'conformance/logic/OR',
  'conformance/logic/NOT',
  'conformance/macros/exists',
  'conformance/macros/all',
  'conformance/macros/nested',
  'conformance/lists/size',
  'conformance/string/size',
  'conformance/timestamps/timestamp_equality',
  'conformance/timestamps/duration_equality',
  'conformance/timestamps/comparisons',
  'conformance/fp_math/fp_math',
  'conformance/integer_math/int64_math',
  'conformance/integer_math/uint64_math'
])

function isAllowedSubsetBoolVector(suitePath: string, item: SerializedIncrementalTest): boolean {
  const topSuite = suitePath.split('/').slice(0, 3).join('/')
  if (!ALLOWED_SUBSET_SUITES.has(topSuite)) return false
  const orig = item.original as unknown as RawConformanceOriginal
  if (!orig || typeof orig.expr !== 'string') return false
  if (item.type !== 'bool') return false
  if (!orig.value || typeof orig.value.boolValue !== 'boolean') {
    return false
  }
  if (orig.typeEnv && orig.typeEnv.length > 0) return false
  if (orig.bindings && Object.keys(orig.bindings).length > 0) return false
  if (orig.container) return false

  // Exclude syntax outside TRD's allowed subset (map/message literals, ternary, bytes literals, non-subset casts)
  const expr = orig.expr
  if (expr.includes('{') || expr.includes('?')) return false
  if (/\b[bB]['"]/.test(expr)) return false
  if (/\b(?:dyn|type|uint|string|bool|bytes)\s*\(/.test(expr)) return false

  return true
}

describe('@bufbuild/cel-spec 0.6.2 conformance vectors for the allowed CEL subset', () => {
  const allItems = collectSuiteTests(conformanceSuite)
  const matchingVectors = allItems.filter(({ suitePath, item }) => isAllowedSubsetBoolVector(suitePath, item))

  test('discovers a substantive set of official cel-spec boolean vectors in the allowed subset independently of check()', () => {
    expect(matchingVectors.length).toBeGreaterThanOrEqual(150)
    const names = new Set(matchingVectors.map(({ item }) => (item.original as unknown as RawConformanceOriginal).name))
    expect(names.has('list_elem_type_shortcircuit')).toBe(true)
    expect(names.has('list_elem_type_exhaustive')).toBe(true)
    expect(names.has('all_all')).toBe(true)
  })

  test('every matching cel-spec conformance vector type-checks and evaluates to the spec expected boolean', () => {
    const tEval = '2026-11-02T07:05:00Z'
    const emptySnap: IndicatorSnapshot = {
      projectId: 'proj-conformance',
      pack: 'sky',
      tEval,
      inputs: [],
      site: {},
      series: {},
      nights: [],
      registryHash: 'reg',
      hash: 'snap'
    }

    for (const { suitePath, item } of matchingVectors) {
      const orig = item.original as unknown as RawConformanceOriginal
      const expr = orig.expr!
      const expectedBool = orig.value!.boolValue!
      const vecName = orig.name ?? 'vec'

      const sheet: SheetInput = {
        pack: 'sky',
        clauses: [
          {
            key: 'conformance_vec',
            name: `${suitePath}/${vecName}`,
            enabled: true,
            scope: 'site',
            requires: [],
            when: expr,
            proposes: { mode: 'outdoor_limited' },
            wording: { en: 'Conformance check' }
          }
        ]
      }

      const checked = check(sheet, TEST_REGISTRY)
      expect(checked.ok, `${suitePath}/${vecName}: ${expr}`).toBe(true)

      const verdicts = evaluate(checked.sheet!, emptySnap, [], tEval)
      const clauseRes = verdicts.site[0]?.clauses[0]
      expect(clauseRes?.result, `${suitePath}/${vecName}: ${expr} expected ${String(expectedBool)}`).toBe(
        expectedBool ? 'fired' : 'not_fired'
      )
    }
  })
})
