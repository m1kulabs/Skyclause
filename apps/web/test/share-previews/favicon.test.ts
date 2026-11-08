import { markSvg, projectFaviconSvg } from '@skyclause/elements'
import { describe, expect, test } from 'vitest'
import { favicon } from '../../features/share-previews/routes'
import type { PreviewReads, PublicStatus } from '../../features/share-previews/reads'
import { call, pack, readsOf, status } from './doubles'

const PARAMS = { org: 'apu', project: 'bukit-jalil' }
const URL_ = 'https://skyclause.m1ku.tech/p/apu/bukit-jalil/favicon.svg'
const T = Date.parse('2026-11-02T07:00:00Z')

const get = (reads: PreviewReads, headers: Record<string, string> = {}) =>
  favicon(new Request(URL_, { headers }), PARAMS, { reads: () => reads, now: () => new Date(T) })

const inForce = (mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'surge_night') =>
  pack({ pack: mode === 'surge_night' ? 'crowd' : 'sky', basis: 'approved_call', call_id: call().id, mode })
const failing = {
  inputs: [{ name: 'site.rain_60m_mm', source_id: 'src-jps', state: 'error' as const, since: '2026-11-02T06:50:00Z' }]
}

/** A shared cache that honours `max-age` and revalidates with the stored `ETag`, as browsers and CDNs do. */
function cached(reads: PreviewReads, clock: { now: number }) {
  let entry: { body: string; etag: string; expires: number } | null = null
  return async () => {
    if (entry && clock.now < entry.expires) return entry.body
    const response = await favicon(
      new Request(URL_, { headers: entry ? { 'If-None-Match': entry.etag } : {} }),
      PARAMS,
      { reads: () => reads, now: () => new Date(clock.now) }
    )
    const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get('Cache-Control') ?? '')?.[1])
    const body = response.status === 304 ? entry!.body : await response.text()
    entry = { body, etag: response.headers.get('ETag')!, expires: clock.now + maxAge * 1000 }
    return body
  }
}

describe('WEB-3: the live favicon follows the public state within 60 seconds', () => {
  for (const [change, changed] of [
    ['an approved call comes into force', status({ state_version: 'v2', packs: [inForce('commute_disruption')] })],
    ['a required input fails', status({ state_version: 'v2', packs: [pack({ pack: 'sky', no_call: failing })] })]
  ] as const) {
    test(`when ${change}, the first request after max-age returns the new SVG and ETag`, async () => {
      const clock = { now: T }
      let current: PublicStatus = status()
      const fetchIcon = cached(readsOf({ status: () => current }), clock)

      expect(await fetchIcon()).toBe(markSvg)
      clock.now = T + 10_000
      current = changed
      clock.now = T + 59_999
      expect(await fetchIcon()).toBe(markSvg)
      clock.now = T + 60_000
      expect(await fetchIcon()).not.toBe(markSvg)
    })
  }

  test('answers with max-age=60 and an ETag from state_version, and 304 while it matches', async () => {
    const reads = readsOf({ status: status({ state_version: 'sv-41' }) })
    const first = await get(reads)
    expect(first.status).toBe(200)
    expect(first.headers.get('Content-Type')).toBe('image/svg+xml')
    expect(first.headers.get('Cache-Control')).toBe('public, max-age=60')
    expect(first.headers.get('ETag')).toBe('"sv-41"')

    for (const match of ['"sv-41"', 'W/"sv-41"', '"other", "sv-41"', '*']) {
      const again = await get(reads, { 'If-None-Match': match })
      expect(again.status, match).toBe(304)
      expect(again.headers.get('ETag')).toBe('"sv-41"')
      expect(again.headers.get('Cache-Control')).toBe('public, max-age=60')
      expect(await again.text()).toBe('')
    }
    expect((await get(reads, { 'If-None-Match': '"sv-40"' })).status).toBe(200)
  })
})

describe('the glyph is D3 public state only', () => {
  const svgFor = async (packs: PublicStatus['packs']) => (await get(readsOf({ status: status({ packs }) }))).text()

  test('plain mark with no approved call in force, even when an engine verdict has a mode', async () => {
    expect(await svgFor([pack({ pack: 'sky' }), pack({ pack: 'crowd' })])).toBe(markSvg)
    expect(await svgFor([pack({ pack: 'sky', basis: 'engine_verdict', mode: 'hybrid_recommended' })])).toBe(markSvg)
  })

  test('the most severe colour level across packs wins, Sky first on a tie', async () => {
    expect(await svgFor([inForce('normal'), inForce('surge_night')])).toBe(projectFaviconSvg({ mode: 'surge_night' }))
    expect(await svgFor([inForce('outdoor_limited'), inForce('surge_night')])).toBe(
      projectFaviconSvg({ mode: 'outdoor_limited' })
    )
    expect(await svgFor([inForce('commute_disruption'), inForce('surge_night')])).toBe(
      projectFaviconSvg({ mode: 'commute_disruption' })
    )
  })

  test('a failing required input in any pack shows the crimson cross over the call', async () => {
    const crowd = { ...inForce('surge_night'), no_call: failing }
    expect(await svgFor([inForce('commute_disruption'), crowd])).toBe(projectFaviconSvg({ error: true }))
  })

  test('a private or missing project gets the 404', async () => {
    const response = await favicon(
      new Request('https://skyclause.m1ku.tech/p/apu/hidden/favicon.svg'),
      {
        org: 'apu',
        project: 'hidden'
      },
      { reads: () => readsOf({ status: status() }), now: () => new Date(T) }
    )
    expect(response.status).toBe(404)
  })
})
