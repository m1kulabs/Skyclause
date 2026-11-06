import * as clauses from '../src/index'
import { NotBuiltError } from '../src/not-built'
import { expect, test } from 'vitest'

const placeholders = [
  { name: 'snapshotAt', owner: 'b-clauses' },
  { name: 'check', owner: 'b-clauses' },
  { name: 'evaluate', owner: 'b-clauses' },
  { name: 'explain', owner: 'b-clauses' },
  { name: 'replay', owner: 'b-replay' },
  { name: 'diff', owner: 'b-clauses' },
  { name: 'deriveInputState', owner: 'b-clauses' }
] as const

test.each(placeholders)('$name throws NotBuiltError owned by $owner', ({ name, owner }) => {
  let thrown: unknown
  try {
    ;(clauses as unknown as Record<string, () => unknown>)[name]!()
  } catch (error) {
    thrown = error
  }

  expect(thrown).toBeInstanceOf(NotBuiltError)
  expect(thrown).toMatchObject({ owner })
})
