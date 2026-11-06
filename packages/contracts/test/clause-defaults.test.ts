/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { SheetInput } from '../src/clauses'

const sky = SheetInput.parse(JSON.parse(readFileSync(`${import.meta.dirname}/../../clauses/defaults/sky.json`, 'utf8')))
const crowd = SheetInput.parse(
  JSON.parse(readFileSync(`${import.meta.dirname}/../../clauses/defaults/crowd.json`, 'utf8'))
)

describe.each([
  {
    pack: 'sky',
    sheet: sky,
    keys: ['haze_watch', 'haze_severe', 'storm_watch', 'storm_confirmed', 'flash_flood_risk', 'silent_input']
  },
  {
    pack: 'crowd',
    sheet: crowd,
    keys: ['surge_night', 'arrival_clash', 'exit_clash', 'after_last_shuttle', 'single_source_listing', 'silent_input']
  }
])('$pack defaults', ({ pack, sheet, keys }) => {
  test('parse against SheetInput with exactly the Spec §1 clause keys', () => {
    const parsed = SheetInput.parse(sheet)
    expect(parsed.pack).toBe(pack)
    expect(parsed.clauses.map((clause) => clause.key)).toEqual(keys)
    expect(parsed.clauses.every((clause) => clause.enabled)).toBe(true)
    expect(parsed.clauses.find((clause) => clause.key === 'silent_input')?.builtin).toBe('silent_input')
  })
})

test('Sky defaults preserve optional camera and rain and release expiry', () => {
  const clauses = SheetInput.parse(sky).clauses
  expect(clauses.find((clause) => clause.key === 'haze_watch')?.optional).toEqual([
    'site.camera_far_low_frames',
    'site.rain_60m_mm'
  ])
  for (const key of ['storm_confirmed', 'flash_flood_risk']) {
    expect(clauses.find((clause) => clause.key === key)?.expiry).toBe('end')
  }
  expect(clauses.find((clause) => clause.key === 'storm_confirmed')?.span).toEqual({ from: 'end-30m', to: 'end+60m' })
  expect(clauses.find((clause) => clause.key === 'haze_severe')?.wording.en).toContain(
    "Teaching mode is the lecturer's and the university's decision"
  )
})

test('SheetInput rejects invalid modes, recommendations and span references', () => {
  const clause = sky.clauses[0]!
  for (const changed of [
    { ...clause, proposes: { mode: 'watch' } },
    { ...clause, proposes: { recommendations: ['cancel'] } },
    { ...clause, span: { from: 'now', to: 'end' } }
  ]) {
    expect(SheetInput.safeParse({ pack: 'sky', clauses: [changed] }).success).toBe(false)
  }
})

test('SheetInput carries no invented schema examples', () => {
  expect(JSON.stringify(z.toJSONSchema(SheetInput))).not.toMatch(/"examples?":/)
})
