import * as clauses from '../src/index'
import { NotBuiltError } from '../src/not-built'
import { expect, test } from 'vitest'
import { TEST_REGISTRY } from './test-helpers'

const unbuiltPlaceholders = [{ name: 'replay', owner: 'b-replay' }] as const

test.each(unbuiltPlaceholders)('$name throws NotBuiltError owned by $owner', ({ name, owner }) => {
  let thrown: unknown
  try {
    ;(clauses as unknown as Record<string, () => unknown>)[name]!()
  } catch (error) {
    thrown = error
  }

  expect(thrown).toBeInstanceOf(NotBuiltError)
  expect(thrown).toMatchObject({ owner })
})

test('b-clauses exports are implemented and do not throw NotBuiltError', () => {
  const checked = clauses.check({ pack: 'sky', clauses: [] }, TEST_REGISTRY)
  expect(checked.ok).toBe(true)
  expect(checked.sheet).toBeDefined()

  const history = { sources: [], polls: [], readings: [] }
  expect(clauses.deriveInputState(history, 'none', '2026-11-02T07:05:00Z')).toBe('stale')

  const snap = clauses.snapshotAt(history, TEST_REGISTRY, 'proj-1', 'sky', '2026-11-02T07:05:00Z')
  const verdicts = clauses.evaluate(checked.sheet!, snap, [], '2026-11-02T07:05:00Z')
  expect(clauses.explain(verdicts)).toEqual([])
  expect(clauses.diff({ pack: 'sky', clauses: [] }, { pack: 'sky', clauses: [] })).toEqual([])
})
