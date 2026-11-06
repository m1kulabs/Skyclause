/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, expectTypeOf, test } from 'vitest'
import { REGISTRY_NAMES } from '../src/types'
import type { BlockedInput, WordingPlaceholder } from '../src/types'

const readDefault = (pack: 'sky' | 'crowd') =>
  JSON.parse(readFileSync(`${import.meta.dirname}/../defaults/${pack}.json`, 'utf8'))

describe.each([
  { pack: 'sky', sheet: readDefault('sky') },
  { pack: 'crowd', sheet: readDefault('crowd') }
])('$pack defaults', ({ sheet }) => {
  test('name only registry names in conditions, dependencies and wording', () => {
    const names = new Set<string>(REGISTRY_NAMES)
    for (const clause of sheet.clauses) {
      const reads = [...clause.when.matchAll(/\b(?:site|w)\.[a-zA-Z_][\w.]*/g)].map(
        (match: RegExpMatchArray) => match[0]
      )
      for (const name of [...clause.requires, ...(clause.optional ?? []), ...reads]) {
        expect(names.has(name), `${clause.key}: ${name}`).toBe(true)
      }
      for (const name of reads) {
        expect([...clause.requires, ...(clause.optional ?? [])]).toContain(name)
      }
      for (const wording of Object.values(clause.wording) as string[]) {
        for (const match of wording.matchAll(/\{([^{}]+)\.([^{}.]+)\}/g)) {
          expect(names.has(match[1]!)).toBe(true)
          expect(['value', 'unit', 'age', 'station', 'observed_at']).toContain(match[2])
        }
      }
    }
  })
})

test('blocked inputs can name no bound source and wording uses registry fields', () => {
  expectTypeOf<BlockedInput['sourceId']>().toEqualTypeOf<string | null>()
  expectTypeOf<'{site.rain_60m_mm.value}'>().toExtend<WordingPlaceholder>()
  expectTypeOf<'{site.rain_60m_mm.observed_at}'>().toExtend<WordingPlaceholder>()
  expectTypeOf<'{site.unknown.value}'>().not.toExtend<WordingPlaceholder>()
  expectTypeOf<'{site.rain_60m_mm.unknown}'>().not.toExtend<WordingPlaceholder>()
})

test.skip('default CEL type-checks with check after #131', () => {})
