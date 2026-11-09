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

function isAllowedSubsetBoolVector(item: SerializedIncrementalTest): boolean {
  const orig = item.original as unknown as RawConformanceOriginal
  if (!orig || typeof orig.expr !== 'string') return false
  if (item.type !== 'bool') return false
  if (!orig.value || typeof orig.value.boolValue !== 'boolean') {
    return false
  }
  if (orig.typeEnv && orig.typeEnv.length > 0) return false
  if (orig.bindings && Object.keys(orig.bindings).length > 0) return false
  if (orig.container) return false

  const checkResult = check(
    {
      pack: 'sky',
      clauses: [
        {
          key: 'conformance_vec',
          name: 'Conformance vector',
          enabled: true,
          scope: 'site',
          requires: [],
          when: orig.expr,
          proposes: { mode: 'outdoor_limited' },
          wording: { en: 'Conformance vector' }
        }
      ]
    },
    TEST_REGISTRY
  )

  return checkResult.ok
}

describe('@bufbuild/cel-spec 0.6.2 conformance vectors for the allowed CEL subset', () => {
  const allItems = collectSuiteTests(conformanceSuite)
  const matchingVectors = allItems.filter(({ item }) => isAllowedSubsetBoolVector(item))

  test('discovers a substantive set of official cel-spec boolean vectors in the allowed subset', () => {
    expect(matchingVectors.length).toBeGreaterThanOrEqual(100)
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
