import { layoutStrip, stripSvg } from '@skyclause/elements'
import { describe, expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { callCard, projectCard } from '../../features/share-previews/card'
import { CardView, splitStrip } from '../../features/share-previews/og-card'
import { ReadFailed } from '../../features/share-previews/reads'
import { callOg, projectOg, windowOg } from '../../features/share-previews/routes'
import type { PreviewReads } from '../../features/share-previews/reads'
import { call, pack, publicWindow, rain60, readsOf, status } from './doubles'

const ORIGIN = 'https://skyclause.m1ku.tech'
const NOW = new Date('2026-11-02T07:05:00Z')
const deps = (reads: PreviewReads) => ({ reads: () => reads, now: () => NOW })
const inForce = pack({ pack: 'sky', basis: 'approved_call', call_id: call().id, mode: 'commute_disruption' })
const strip = [
  rain60('2026-11-02T06:00:00Z', 3),
  rain60('2026-11-02T06:30:00Z', 20),
  rain60('2026-11-02T07:00:00Z', 39)
]
const project = { org: 'apu', project: 'bukit-jalil' }

async function png(response: Response) {
  const bytes = Buffer.from(await response.arrayBuffer())
  return {
    type: response.headers.get('Content-Type'),
    signature: [...bytes.subarray(0, 8)],
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bytes: bytes.length
  }
}

const PNG = [137, 80, 78, 71, 13, 10, 26, 10]
const MB_8 = 8 * 1024 * 1024

describe('WEB-4: Open Graph cards', () => {
  test('a project card renders a 1200×630 PNG under 8 MB, cached for 60 s', async () => {
    const reads = readsOf({ status: status({ packs: [inForce], strip }), calls: [call()] })
    const response = await projectOg(new Request(`${ORIGIN}/p/apu/bukit-jalil/og.png`), project, deps(reads))

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=60')
    const image = await png(response)
    expect(image).toMatchObject({ type: 'image/png', signature: PNG, width: 1200, height: 630 })
    expect(image.bytes).toBeLessThan(MB_8)
  })

  test('a project card with no call in force and no strip still renders', async () => {
    const response = await projectOg(
      new Request(`${ORIGIN}/p/apu/bukit-jalil/og.png`),
      project,
      deps(readsOf({ status: status() }))
    )
    expect(await png(response)).toMatchObject({ signature: PNG, width: 1200, height: 630 })
  })

  test('a call card is immutable once its call is sent, and cached 60 s before', async () => {
    const sent = call({ id: 'sent-1', state: 'sent', sent_at: '2026-11-02T07:14:00Z' })
    const approved = call({ id: 'approved-1' })
    const reads = readsOf({ calls: [sent, approved] })

    const immutable = await callOg(new Request(`${ORIGIN}/c/sent-1/og.png`), { callId: 'sent-1' }, deps(reads))
    expect(immutable.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
    expect(await png(immutable)).toMatchObject({ signature: PNG, width: 1200, height: 630 })

    const fresh = await callOg(new Request(`${ORIGIN}/c/approved-1/og.png`), { callId: 'approved-1' }, deps(reads))
    expect(fresh.headers.get('Cache-Control')).toBe('public, max-age=60')
    expect((await png(fresh)).bytes).toBeLessThan(MB_8)
  })

  test('a call card 404s for private, guest-window and unapproved calls, which the public read answers with none', async () => {
    const reads = readsOf({ calls: [call()] })
    for (const callId of ['private-call', 'guest-window-call', 'drafted-call']) {
      const response = await callOg(new Request(`${ORIGIN}/c/${callId}/og.png`), { callId }, deps(reads))
      expect(response.status, callId).toBe(404)
    }
  })

  test('window cards render for public, non-guest windows and 404 otherwise', async () => {
    const reads = readsOf({ status: status(), windows: [publicWindow()], calls: [call()] })
    const id = publicWindow().id
    const shown = await windowOg(
      new Request(`${ORIGIN}/p/apu/bukit-jalil/windows/${id}/og.png`),
      { ...project, id },
      deps(reads)
    )
    expect(shown.headers.get('Cache-Control')).toBe('public, max-age=60')
    expect(await png(shown)).toMatchObject({ signature: PNG, width: 1200, height: 630 })

    for (const [where, params] of [
      ['a guest or private window', { ...project, id: 'guest-window' }],
      ['a window under a private project', { org: 'apu', project: 'hidden', id }]
    ] as const) {
      const response = await windowOg(new Request(`${ORIGIN}/p/x/og.png`), params, deps(reads))
      expect(response.status, where).toBe(404)
    }
  })

  test('private and missing targets get the same 404 on every route', async () => {
    const reads = readsOf({ status: status(), calls: [call()], windows: [publicWindow()] })
    const responses = await Promise.all([
      projectOg(new Request(`${ORIGIN}/p/apu/hidden/og.png`), { org: 'apu', project: 'hidden' }, deps(reads)),
      callOg(new Request(`${ORIGIN}/c/missing/og.png`), { callId: 'missing' }, deps(reads)),
      windowOg(new Request(`${ORIGIN}/p/apu/bukit-jalil/windows/x/og.png`), { ...project, id: 'x' }, deps(reads))
    ])
    const answers = await Promise.all(
      responses.map(async (response) => JSON.stringify([response.status, [...response.headers], await response.text()]))
    )
    expect(new Set(answers).size).toBe(1)
    expect(responses[0]!.status).toBe(404)
  })
})

describe('what a card draws', () => {
  const text = (card: Parameters<typeof CardView>[0]['card']) =>
    renderToStaticMarkup(createElement(CardView, { card }))
      .replace(/<[^>]+>/g, '|')
      .split('|')
      .filter(Boolean)

  test('a project card sets its label, mode, window, strip labels and capture time', () => {
    const card = projectCard(status({ packs: [inForce], strip }), call(), NOW)
    expect(text(card)).toEqual(
      expect.arrayContaining([
        'Skyclause · bukit-jalil',
        'Commute disruption',
        '15:30 MYT – 17:00 MYT · Monday 2 November 2026',
        'Lebat 31 mm',
        'Data captured',
        '2 November 2026, 15:00 MYT'
      ])
    )
  })

  test('a call card adds its approval time; with no strip its band prints the window range', () => {
    expect(text(callCard(call()))).toEqual(
      expect.arrayContaining([
        'Skyclause',
        'Commute disruption',
        '15:30 MYT – 17:00 MYT · Monday 2 November 2026',
        'Approved 15:12 MYT',
        '15:30 MYT – 17:00 MYT',
        '2 November 2026, 15:00 MYT'
      ])
    )
  })
})

describe('a failed read', () => {
  test('passes on as it came, Retry-After included, never cached', async () => {
    const limited = new Response('{"status":429}', {
      status: 429,
      headers: { 'Content-Type': 'application/problem+json', 'Retry-After': '17', 'Cache-Control': 'public' }
    })
    const failing: PreviewReads = {
      projectStatus: async () => {
        throw new ReadFailed(limited)
      },
      call: async () => null,
      window: async () => null
    }
    const response = await projectOg(new Request(`${ORIGIN}/p/apu/bukit-jalil/og.png`), project, deps(failing))
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('17')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.text()).toBe('{"status":429}')
  })
})

describe("the strip's labels", () => {
  test('are lifted out of the SVG with their places, so Satori sets them in Work Sans', () => {
    const { geometry, labels } = splitStrip(
      '<svg><text x="48" y="16" font-size="12" fill="currentColor">2 November 2026 · MYT</text><path d="M0,0"/>' +
        '<text x="624" y="164.0" font-size="10" text-anchor="end" fill="currentColor">Lebat &lt;31 &amp; up</text></svg>'
    )
    expect(geometry).toBe('<svg><path d="M0,0"/></svg>')
    expect(labels).toEqual([
      { x: 48, y: 16, size: 12, anchor: 'start', text: '2 November 2026 · MYT' },
      { x: 624, y: 164, size: 10, anchor: 'end', text: 'Lebat <31 & up' }
    ])
  })

  test("leave none of stripSvg's text behind", () => {
    const svg = stripSvg(layoutStrip({ ...projectCard(status({ strip }), null, NOW).strip! }))
    const { geometry, labels } = splitStrip(svg)
    expect(geometry).not.toContain('<text')
    expect(labels.map((label) => label.text)).toContain('Lebat 31 mm')
  })
})
