import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { InputState, Mode, SourceKind } from '@skyclause/contracts'
import { t } from '@skyclause/i18n'
import {
  attribution,
  brandStates,
  glyphPaths,
  glyphSvg,
  markSvg,
  projectFaviconSvg,
  statusColours,
  tabBadgeSvg,
  wordmarkSvg
} from '../src/index'

const expected = {
  normal: ['ring', 'Normal', 'neutral'],
  storm_watch: ['hollow_triangle', 'Storm watch', 'neutral'],
  outdoor_limited: ['half_disc', 'Outdoor-limited', 'warning'],
  commute_disruption: ['filled_triangle', 'Commute disruption', 'critical'],
  hybrid_recommended: ['filled_square', 'Hybrid recommended', 'critical'],
  surge_night: ['rising_bars', 'Surge night', 'warning'],
  no_call: ['dashed_ring', 'No call', 'no-call'],
  fresh: ['ring', 'Fresh input', 'neutral'],
  stale: ['clock', 'Stale input', 'warning'],
  error: ['cross', 'Input error', 'critical'],
  recovered: ['ring', 'Recovered input', 'neutral'],
  pending: ['dashed_ring', 'Pending input', 'no-call'],
  probation: ['dashed_ring', 'Input on probation', 'no-call'],
  off_hours: ['dashed_ring', 'Outside input hours', 'no-call']
} as const

test('every domain mode and input state has exactly one glyph, word and status level', () => {
  expect(Object.keys(brandStates).sort()).toEqual(
    [...Mode.options, ...InputState.options, 'storm_watch', 'no_call'].sort()
  )
  expect(Object.keys(glyphPaths)).toHaveLength(9)
  for (const [state, mapping] of Object.entries(brandStates)) {
    const [glyph, word, level] = expected[state as keyof typeof expected]
    expect([mapping.glyph, t(mapping.word), mapping.level], state).toEqual([glyph, word, level])
    expect(glyphSvg(state as keyof typeof brandStates)).toContain(glyphPaths[glyph])
    expect(glyphSvg(state as keyof typeof brandStates)).toContain('viewBox="0 0 12 12"')
    expect(glyphSvg(state as keyof typeof brandStates)).toContain('stroke-width="1.5"')
    expect(t(mapping.word, {}, 'ms')).not.toBe(word)
  }
})

test('mark and wordmark follow the window geometry and protected Work Sans identity', () => {
  expect(markSvg).toContain('viewBox="0 0 16 16"')
  expect(markSvg).toContain('stroke-width="2"')
  expect(markSvg).toContain('stroke-width="1"')
  expect(markSvg).toContain('prefers-color-scheme:dark')
  expect(wordmarkSvg).toContain('translate="no"')
  expect(wordmarkSvg).toContain('Work Sans')
  expect(wordmarkSvg).toContain('font-weight="500"')
  expect(wordmarkSvg).toContain('letter-spacing="-0.02em"')
  expect(wordmarkSvg).toContain('>Skyclause</text>')
  expect(wordmarkSvg).not.toContain('crimson')
})

test('standalone SVG colours are exactly the existing f-ui status tokens', () => {
  const css = readFileSync(new URL('../../../apps/web/styles/globals.css', import.meta.url), 'utf8')
  for (const [theme, colours] of Object.entries(statusColours)) {
    const selector = theme === 'light' ? '.light' : ':root,\n.dark'
    const block = css.slice(css.indexOf(`${selector} {`)).split('}')[0]!
    for (const [level, colour] of Object.entries(colours)) {
      expect(block).toContain(`--status-${level}-foreground: ${colour};`)
    }
  }
})

describe('tabBadgeSvg', () => {
  test('none is the plain mark and 1–9 and 9+ are eleven distinct prerenderable assets', () => {
    expect(tabBadgeSvg()).toBe(markSvg)
    expect(tabBadgeSvg(0)).toBe(markSvg)
    const assets = [tabBadgeSvg(), ...Array.from({ length: 9 }, (_, i) => tabBadgeSvg(i + 1)), tabBadgeSvg('9+')]
    expect(new Set(assets).size).toBe(11)
    for (let count = 1; count <= 9; count++) {
      expect(tabBadgeSvg(count)).toContain(`>${count}</text>`)
      expect(tabBadgeSvg(count)).toContain('<circle')
      expect(tabBadgeSvg(count)).toContain('fill="#ffffff"')
    }
    expect(tabBadgeSvg('9+')).toContain('>9+</text>')
    expect(tabBadgeSvg(10)).toBe(tabBadgeSvg('9+'))
    expect(tabBadgeSvg(999)).toBe(tabBadgeSvg('9+'))
  })
  test.each([-1, 1.5, NaN, Infinity])('rejects invalid counts (%s)', (count) => {
    expect(() => tabBadgeSvg(count)).toThrow(RangeError)
  })
})

describe('projectFaviconSvg', () => {
  test.each(Mode.options)('approved %s uses its own glyph and status colour', (mode) => {
    const svg = projectFaviconSvg({ mode })
    const mapping = brandStates[mode]
    expect(svg).toContain(glyphPaths[mapping.glyph])
    expect(svg).toContain(statusColours.dark[mapping.level])
    expect(svg).toContain(statusColours.light[mapping.level])
    expect(svg).toContain('translate(4 4) scale(0.666667)')
  })
  test('error overrides an approved mode; no approved call is the plain mark (D3)', () => {
    expect(projectFaviconSvg()).toBe(markSvg)
    expect(projectFaviconSvg({ mode: null })).toBe(markSvg)
    expect(projectFaviconSvg({ mode: 'normal', error: true })).toContain(glyphPaths.cross)
    expect(projectFaviconSvg({ error: true })).toContain(glyphPaths.cross)
  })
})

test('every source has an attribution; JPS, APIMS and GoLive are derived only (D32)', () => {
  expect(Object.keys(attribution).sort()).toEqual([...SourceKind.options].sort())
  for (const kind of ['met_warning', 'met_forecast', 'rapidrail_od', 'gtfs_static', 'gtfs_rt'] as const) {
    expect(attribution[kind]).toEqual({
      licence_name: 'CC BY 4.0',
      licence_url: 'https://creativecommons.org/licenses/by/4.0/',
      derived_only: false
    })
  }
  expect(attribution.wikipedia).toEqual({
    licence_name: 'CC BY-SA 4.0',
    licence_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    derived_only: false
  })
  for (const kind of ['jps_rain', 'apims', 'golive'] as const) {
    expect(attribution[kind]).toEqual({ licence_name: null, licence_url: null, derived_only: true })
  }
  for (const kind of ['camera', 'pi'] as const) {
    expect(attribution[kind].derived_only).toBe(true)
    expect(attribution[kind].licence_url).toBeNull()
  }
})

test('shared public lines have the exact English wording and complete Malay catalogues', () => {
  expect(t('brand.non_affiliation')).toBe(
    'Not affiliated with APU, KPT, JPS, MET, DOE, Prasarana/Rapid KL or the stadium.'
  )
  expect(t('brand.not_safety_service')).toBe(
    'Skyclause is not a safety or emergency service. In an emergency, call 999.'
  )
  expect(t('brand.non_affiliation', {}, 'ms')).toContain('Tidak mempunyai hubungan')
  expect(t('brand.not_safety_service', {}, 'ms')).toContain('999')
  expect(t('brand.badge_with_pack', { pack: 'Sky', mode: 'Normal' })).toBe('Sky: Normal')
})
