/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { canonicalHash, check } from '../src'
import type { Clause, IndicatorRegistry, SheetInput } from '../src/types'
import { TEST_REGISTRY } from './test-helpers'

const readDefault = (pack: 'sky' | 'crowd'): SheetInput =>
  JSON.parse(readFileSync(`${import.meta.dirname}/../defaults/${pack}.json`, 'utf8')) as SheetInput

function makeClause(overrides: Partial<Clause> = {}): Clause {
  return {
    key: 'custom_clause',
    name: 'Custom clause',
    enabled: true,
    scope: 'window',
    requires: ['w.rain_max_60m_mm'],
    span: { from: 'end-30m', to: 'end+60m' },
    when: 'w.rain_max_60m_mm >= 31',
    expiry: 'end',
    proposes: { mode: 'commute_disruption' },
    wording: { en: 'Storm confirmed at the JPS gauge (Lebat class)' },
    ...overrides
  }
}

describe('check(sheet, registry)', () => {
  test('validates both default sheets (sky and crowd) as ok and publishable with canonical hashes', () => {
    for (const pack of ['sky', 'crowd'] as const) {
      const sheet = readDefault(pack)
      const res = check(sheet, TEST_REGISTRY)
      expect(res.ok).toBe(true)
      expect(res.publishable).toBe(true)
      expect(res.issues).toEqual([])
      expect(res.sheet).toEqual({
        ...sheet,
        contentHash: canonicalHash(sheet),
        registryHash: canonicalHash(TEST_REGISTRY)
      })
    }
  })

  test('reports unknown indicator in when with exact source offset and length (CLS-6)', () => {
    const when = 'w.rain_max_60m_mm >= 31 && site.unknown_metric > 5'
    const sheet: SheetInput = {
      pack: 'sky',
      clauses: [
        makeClause({
          key: 'bad_indicator',
          requires: ['w.rain_max_60m_mm'],
          when
        })
      ]
    }
    const res = check(sheet, TEST_REGISTRY)
    expect(res.ok).toBe(false)
    expect(res.publishable).toBe(false)
    expect(res.sheet).toBeUndefined()
    const issue = res.issues.find((i) => i.clauseKey === 'bad_indicator' && i.message.includes('site.unknown_metric'))
    expect(issue).toBeDefined()
    expect(when.slice(issue!.offset, issue!.offset + issue!.length)).toBe('site.unknown_metric')
  })

  test('reports unknown indicator in requires or optional', () => {
    const sheet: SheetInput = {
      pack: 'sky',
      clauses: [
        makeClause({
          key: 'bad_dep',
          requires: ['w.rain_max_60m_mm', 'site.not_in_registry'],
          optional: ['w.also_missing'],
          when: 'w.rain_max_60m_mm >= 31'
        })
      ]
    }
    const res = check(sheet, TEST_REGISTRY)
    expect(res.ok).toBe(false)
    expect(res.publishable).toBe(false)
    expect(res.issues.some((i) => i.message.includes('site.not_in_registry'))).toBe(true)
    expect(res.issues.some((i) => i.message.includes('w.also_missing'))).toBe(true)
  })

  test('enforces dependency coverage: every indicator read in when must be in requires or optional', () => {
    const when = 'w.rain_max_60m_mm >= 31 && site.api_max >= 101'
    const sheet: SheetInput = {
      pack: 'sky',
      clauses: [
        makeClause({
          key: 'missing_dep',
          requires: ['w.rain_max_60m_mm'],
          when
        })
      ]
    }
    const res = check(sheet, TEST_REGISTRY)
    expect(res.ok).toBe(false)
    expect(res.publishable).toBe(false)
    const issue = res.issues.find((i) => i.clauseKey === 'missing_dep' && i.message.includes('site.api_max'))
    expect(issue).toBeDefined()
    expect(when.slice(issue!.offset, issue!.offset + issue!.length)).toBe('site.api_max')
  })

  test('allows window fields (w.start, w.end, w.start_local_min, w.end_local_min, w.kind, w.duration) in window clauses when declared in requires', () => {
    const when =
      'w.rain_max_60m_mm >= 31 && w.end > w.start && w.start_local_min >= 480 && w.end_local_min <= 1080 && w.kind == "class" && w.duration <= duration("2h")'
    const sheet: SheetInput = {
      pack: 'sky',
      clauses: [
        makeClause({
          key: 'window_fields_ok',
          requires: [
            'w.rain_max_60m_mm',
            'w.start',
            'w.end',
            'w.start_local_min',
            'w.end_local_min',
            'w.kind',
            'w.duration'
          ],
          when
        })
      ]
    }
    const res = check(sheet, TEST_REGISTRY)
    expect(res.ok).toBe(true)
    expect(res.publishable).toBe(true)
  })

  test('supports optional has() on dotted indicators and rejects invalid has() targets', () => {
    const validSheet: SheetInput = {
      pack: 'sky',
      clauses: [
        makeClause({
          key: 'optional_cam',
          requires: ['w.rain_max_60m_mm'],
          optional: ['site.camera_far_low_frames'],
          when: 'w.rain_max_60m_mm >= 31 && has(site.camera_far_low_frames) && site.camera_far_low_frames >= 3'
        })
      ]
    }
    expect(check(validSheet, TEST_REGISTRY).ok).toBe(true)

    const badWhen = 'has(site.unknown_cam)'
    const badSheet: SheetInput = {
      pack: 'sky',
      clauses: [
        makeClause({
          key: 'bad_has',
          requires: [],
          when: badWhen
        })
      ]
    }
    const badRes = check(badSheet, TEST_REGISTRY)
    expect(badRes.ok).toBe(false)
    expect(badRes.publishable).toBe(false)
    const issue = badRes.issues.find((i) => i.clauseKey === 'bad_has')
    expect(issue).toBeDefined()
    expect(badWhen.slice(issue!.offset, issue!.offset + issue!.length)).toContain('site.unknown_cam')
  })

  test('rejects type mismatches and non-boolean condition return types at source positions', () => {
    const typeMismatchWhen = 'w.rain_max_60m_mm >= "thirty-one"'
    const mismatchSheet: SheetInput = {
      pack: 'sky',
      clauses: [
        makeClause({
          key: 'mismatch_clause',
          when: typeMismatchWhen
        })
      ]
    }
    const mismatchRes = check(mismatchSheet, TEST_REGISTRY)
    expect(mismatchRes.ok).toBe(false)
    expect(mismatchRes.publishable).toBe(false)
    expect(mismatchRes.issues[0]?.clauseKey).toBe('mismatch_clause')
    expect(mismatchRes.issues[0]?.offset).toBeGreaterThanOrEqual(0)
    expect(mismatchRes.issues[0]?.length).toBeGreaterThan(0)

    const nonBoolWhen = 'w.rain_max_60m_mm + 10.0'
    const nonBoolSheet: SheetInput = {
      pack: 'sky',
      clauses: [
        makeClause({
          key: 'non_bool_clause',
          when: nonBoolWhen
        })
      ]
    }
    const nonBoolRes = check(nonBoolSheet, TEST_REGISTRY)
    expect(nonBoolRes.ok).toBe(false)
    expect(nonBoolRes.publishable).toBe(false)
    expect(nonBoolRes.issues.some((i) => i.clauseKey === 'non_bool_clause')).toBe(true)
  })

  test('supports size(), all(), and exists() over list indicators and rejects non-list comprehension targets', () => {
    const regWithList: IndicatorRegistry = [
      ...TEST_REGISTRY,
      {
        name: 'site.api_samples',
        celType: 'list',
        unit: 'API',
        scope: 'site',
        sourceKind: 'apims'
      }
    ]
    const listSheet: SheetInput = {
      pack: 'sky',
      clauses: [
        makeClause({
          key: 'list_clause',
          scope: 'site',
          span: undefined,
          expiry: undefined,
          requires: ['site.api_samples'],
          when: 'size(site.api_samples) >= 3 && site.api_samples.all(x, x >= 100) && site.api_samples.exists(x, x >= 150)'
        })
      ]
    }
    const okRes = check(listSheet, regWithList)
    expect(okRes.ok).toBe(true)
    expect(okRes.publishable).toBe(true)

    const badTargetWhen = 'site.api_max.all(x, x >= 100)'
    const badListSheet: SheetInput = {
      pack: 'sky',
      clauses: [
        makeClause({
          key: 'bad_list_clause',
          scope: 'site',
          span: undefined,
          expiry: undefined,
          requires: ['site.api_max'],
          when: badTargetWhen
        })
      ]
    }
    const badRes = check(badListSheet, regWithList)
    expect(badRes.ok).toBe(false)
    expect(badRes.publishable).toBe(false)
  })

  test('rejects forbidden CEL constructs (now, matches, map, filter, custom functions) at exact source offsets', () => {
    const cases = [
      { when: 'w.end > now()', requires: ['w.end'], token: 'now' },
      { when: 'w.end > now', requires: ['w.end'], token: 'now' },
      { when: 'w.kind.matches("^class$")', requires: ['w.kind'], token: 'matches' },
      { when: '[1, 2].map(x, x + 1).size() > 0', requires: [], token: 'map' },
      { when: '[1, 2].filter(x, x > 1).size() > 0', requires: [], token: 'filter' },
      { when: 'httpGet("https://example.com") == true', requires: [], token: 'httpGet' }
    ]

    for (const { when, requires, token } of cases) {
      const sheet: SheetInput = {
        pack: 'sky',
        clauses: [
          makeClause({
            key: 'forbidden_construct',
            requires,
            when
          })
        ]
      }
      const res = check(sheet, TEST_REGISTRY)
      expect(res.ok, `expected ${when} to fail check`).toBe(false)
      expect(res.publishable).toBe(false)
      const issue = res.issues.find((i) => i.clauseKey === 'forbidden_construct')
      expect(issue, `expected issue for ${when}`).toBeDefined()
      expect(when.slice(issue!.offset, issue!.offset + issue!.length)).toContain(token)
    }
  })

  test('enforces teaching line on hybrid_recommended clauses: ok=true, publishable=false when missing (CLS-10)', () => {
    const sheetWithoutTeachingLine: SheetInput = {
      pack: 'sky',
      clauses: [
        makeClause({
          key: 'haze_severe_bad',
          scope: 'site',
          span: undefined,
          expiry: undefined,
          requires: ['site.api_max'],
          when: 'site.api_max >= 201',
          proposes: { mode: 'hybrid_recommended' },
          wording: {
            en: 'Hybrid mode is recommended for all classes today.'
          }
        })
      ]
    }
    const res = check(sheetWithoutTeachingLine, TEST_REGISTRY)
    expect(res.ok).toBe(true)
    expect(res.publishable).toBe(false)
    expect(
      res.issues.some((i) => i.clauseKey === 'haze_severe_bad' && i.message.toLowerCase().includes('teaching mode'))
    ).toBe(true)

    const sheetWithLowercaseTeachingLine: SheetInput = {
      pack: 'sky',
      clauses: [
        makeClause({
          key: 'haze_severe_lowercase',
          scope: 'site',
          span: undefined,
          expiry: undefined,
          requires: ['site.api_max'],
          when: 'site.api_max >= 201',
          proposes: { mode: 'hybrid_recommended' },
          wording: {
            en: "Hybrid is recommended; teaching mode is the lecturer's and the university's decision"
          }
        })
      ]
    }
    const lowerRes = check(sheetWithLowercaseTeachingLine, TEST_REGISTRY)
    expect(lowerRes.ok).toBe(true)
    expect(lowerRes.publishable).toBe(false)

    const sheetWithChangedPhraseTeachingLine: SheetInput = {
      pack: 'sky',
      clauses: [
        makeClause({
          key: 'haze_severe_changed_phrase',
          scope: 'site',
          span: undefined,
          expiry: undefined,
          requires: ['site.api_max'],
          when: 'site.api_max >= 201',
          proposes: { mode: 'hybrid_recommended' },
          wording: {
            en: "Hybrid is recommended. Teaching mode is the lecturer's decision"
          }
        })
      ]
    }
    const phraseRes = check(sheetWithChangedPhraseTeachingLine, TEST_REGISTRY)
    expect(phraseRes.ok).toBe(true)
    expect(phraseRes.publishable).toBe(false)

    const sheetWithTeachingLine: SheetInput = {
      pack: 'sky',
      clauses: [
        makeClause({
          key: 'haze_severe_ok',
          scope: 'site',
          span: undefined,
          expiry: undefined,
          requires: ['site.api_max'],
          when: 'site.api_max >= 201',
          proposes: { mode: 'hybrid_recommended' },
          wording: {
            en: "Hybrid is recommended. Teaching mode is the lecturer's and the university's decision"
          }
        })
      ]
    }
    const okRes = check(sheetWithTeachingLine, TEST_REGISTRY)
    expect(okRes.ok).toBe(true)
    expect(okRes.publishable).toBe(true)
    expect(okRes.issues).toEqual([])
  })

  test('validates wording placeholders against registry names and WORDING_FIELDS', () => {
    const validSheet: SheetInput = {
      pack: 'sky',
      clauses: [
        makeClause({
          key: 'placeholder_ok',
          wording: {
            en: 'Rain {w.rain_max_60m_mm.value} {w.rain_max_60m_mm.unit} at {w.rain_max_60m_mm.station} ({w.rain_max_60m_mm.age}s, {w.rain_max_60m_mm.observed_at})'
          }
        })
      ]
    }
    expect(check(validSheet, TEST_REGISTRY).ok).toBe(true)

    const badWording = 'Rain {site.unknown_gauge.value} and {w.rain_max_60m_mm.bad_field}'
    const badSheet: SheetInput = {
      pack: 'sky',
      clauses: [
        makeClause({
          key: 'placeholder_bad',
          wording: { en: badWording }
        })
      ]
    }
    const badRes = check(badSheet, TEST_REGISTRY)
    expect(badRes.ok).toBe(false)
    expect(badRes.publishable).toBe(false)
    expect(badRes.issues.length).toBeGreaterThanOrEqual(2)
  })

  test('rejects duplicate clause keys, scope violations (w.* in site clause), and malformed or reversed spans', () => {
    const dupSheet: SheetInput = {
      pack: 'sky',
      clauses: [makeClause({ key: 'dup' }), makeClause({ key: 'dup' })]
    }
    const dupRes = check(dupSheet, TEST_REGISTRY)
    expect(dupRes.ok).toBe(false)
    expect(dupRes.publishable).toBe(false)

    const scopeViolationSheet: SheetInput = {
      pack: 'sky',
      clauses: [
        makeClause({
          key: 'site_reads_w',
          scope: 'site',
          span: undefined,
          expiry: undefined,
          requires: ['w.rain_max_60m_mm'],
          when: 'w.rain_max_60m_mm >= 31'
        })
      ]
    }
    expect(check(scopeViolationSheet, TEST_REGISTRY).ok).toBe(false)

    const reversedSpanSheet: SheetInput = {
      pack: 'sky',
      clauses: [
        makeClause({
          key: 'reversed_span',
          span: { from: 'end+60m', to: 'end-30m' }
        })
      ]
    }
    expect(check(reversedSpanSheet, TEST_REGISTRY).ok).toBe(false)

    const malformedSpanSheet: SheetInput = {
      pack: 'sky',
      clauses: [
        makeClause({
          key: 'malformed_span',
          span: { from: 'middle-10m', to: 'end+60m' }
        })
      ]
    }
    expect(check(malformedSpanSheet, TEST_REGISTRY).ok).toBe(false)
  })
})
