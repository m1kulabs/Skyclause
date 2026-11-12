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
  modeColours,
  projectFaviconSvg,
  statusColours,
  tabBadgeSvg,
  toneColours,
  wordmarkSvg
} from '../src/index'

const expected = {
  normal: ['ring', 'Normal', 'neutral', 'normal'],
  storm_watch: ['hollow_triangle', 'Storm watch', 'neutral', 'watch'],
  outdoor_limited: ['half_disc', 'Outdoor-limited', 'warning', 'outdoor-limited'],
  commute_disruption: ['filled_triangle', 'Commute disruption', 'critical', 'commute-disruption'],
  hybrid_recommended: ['filled_square', 'Hybrid recommended', 'critical', 'hybrid-recommended'],
  surge_night: ['rising_bars', 'Surge night', 'warning', 'surge-night'],
  no_call: ['dashed_ring', 'No call', 'no-call', 'no-call'],
  fresh: ['ring', 'Fresh input', 'neutral', 'normal'],
  stale: ['clock', 'Stale input', 'warning', 'watch'],
  error: ['cross', 'Input error', 'critical', 'no-call'],
  recovered: ['ring', 'Recovered input', 'neutral', 'normal'],
  pending: ['dashed_ring', 'Pending input', 'no-call', 'no-call'],
  probation: ['dashed_ring', 'Input on probation', 'no-call', 'no-call'],
  off_hours: ['dashed_ring', 'Outside input hours', 'no-call', 'no-call']
} as const

test('every domain mode and input state has exactly one glyph, word, status level and tone', () => {
  expect(Object.keys(brandStates).sort()).toEqual(
    [...Mode.options, ...InputState.options, 'storm_watch', 'no_call'].sort()
  )
  expect(Object.keys(glyphPaths)).toHaveLength(9)
  for (const [state, mapping] of Object.entries(brandStates)) {
    const [glyph, word, level, tone] = expected[state as keyof typeof expected]
    expect([mapping.glyph, t(mapping.word), mapping.level, mapping.tone], state).toEqual([glyph, word, level, tone])
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

test('standalone SVG colours are exactly the Dusk and Day tokens of the same names', () => {
  const css = readFileSync(new URL('../../../apps/web/styles/globals.css', import.meta.url), 'utf8')
  for (const [theme, colours] of Object.entries(modeColours)) {
    const selector =
      theme === 'light' ? '.light {' : ":root,\n.dark,\n[data-surface='marketing'],\n[data-surface='auth'] {"
    const block = css.slice(css.indexOf(selector)).split('}')[0]!
    for (const [name, colour] of Object.entries(colours)) {
      // Day sets only what differs from Dusk; a token Day leaves alone must equal Dusk's.
      if (theme === 'light' && !block.includes(`--${name}:`))
        expect(colour, name).toBe(modeColours.dark[name as keyof typeof modeColours.dark])
      else expect(block, name).toContain(`--${name}: ${colour};`)
    }
  }
  for (const [theme, colours] of Object.entries(statusColours)) {
    const scheme = modeColours[theme as keyof typeof modeColours]
    expect(colours).toEqual({
      neutral: scheme.ink,
      warning: scheme['mode-outdoor-limited'],
      critical: scheme['mode-hybrid-recommended'],
      'no-call': scheme['ink-muted']
    })
  }
})

test('a tone names its capsule: a hue fill with its own ink, or an edge with no fill', () => {
  const dusk = modeColours.dark
  expect(toneColours('commute-disruption', dusk)).toEqual({
    fill: dusk['mode-commute-disruption'],
    edge: null,
    ink: dusk['mode-commute-disruption-ink']
  })
  expect(toneColours('normal', dusk)).toEqual({ fill: dusk['mode-normal'], edge: dusk['ink-muted'], ink: dusk.ink })
  expect(toneColours('watch', dusk)).toEqual({ fill: null, edge: dusk.ink, ink: dusk.ink })
  expect(toneColours('no-call', dusk)).toEqual({ fill: null, edge: dusk['ink-muted'], ink: dusk.ink })
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
