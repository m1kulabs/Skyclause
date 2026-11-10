/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, expectTypeOf, test } from 'vitest'
import { check, REGISTRY_NAMES } from '../src'
import type { BlockedInput, SheetInput, WordingPlaceholder } from '../src/types'
import { TEST_REGISTRY } from './test-helpers'

const readDefault = (pack: 'sky' | 'crowd'): SheetInput =>
  JSON.parse(readFileSync(`${import.meta.dirname}/../defaults/${pack}.json`, 'utf8')) as SheetInput

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

test('default CEL type-checks with check after #131', () => {
  for (const pack of ['sky', 'crowd'] as const) {
    const sheet = readDefault(pack)
    const start = performance.now()
    const res = check(sheet, TEST_REGISTRY)
    const elapsedMs = performance.now() - start
    expect(res.ok).toBe(true)
    expect(res.publishable).toBe(true)
    expect(res.issues).toEqual([])
    expect(res.sheet?.contentHash).toMatch(/^[0-9a-f]{64}$/)
    expect(res.sheet?.registryHash).toMatch(/^[0-9a-f]{64}$/)
    expect(elapsedMs).toBeLessThanOrEqual(50)
  }
})
