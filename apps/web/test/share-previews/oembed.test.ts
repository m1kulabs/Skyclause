import { afterEach, describe, expect, test, vi } from 'vitest'
import { oembed } from '../../features/share-previews/routes'
import type { PreviewReads } from '../../features/share-previews/reads'
import { call, readsOf, status } from './doubles'

const SINGLE = 'https://web-413187272599.asia-southeast1.run.app'
const reads = readsOf({ status: status(), calls: [call()] })

function ask(query: Record<string, string>, o: { origin?: string; reads?: PreviewReads } = {}) {
  const origin = o.origin ?? SINGLE
  return oembed(
    new Request(`${origin}/oembed?${new URLSearchParams(query)}`, { headers: { host: new URL(origin).host } }),
    {
      reads: () => o.reads ?? reads,
      now: () => new Date('2026-11-02T07:05:00Z')
    }
  )
}

/** oEmbed 1.0 §2.3.4: the response parameters, and §2.3.4.4's required `html`, `width` and `height` for `rich`. */
function expectRich(body: Record<string, unknown>) {
  const string = (key: string) => expect(typeof body[key], key).toBe('string')
  const positive = (key: string) => expect(Number.isInteger(body[key]) && (body[key] as number) > 0, key).toBe(true)
  expect(body.type).toBe('rich')
  expect(body.version).toBe('1.0')
  string('html')
  positive('width')
  positive('height')
  for (const key of ['title', 'author_name', 'author_url', 'provider_name', 'provider_url', 'thumbnail_url']) {
    if (key in body) string(key)
  }
  if ('cache_age' in body) positive('cache_age')
  const thumbnail = ['thumbnail_url', 'thumbnail_width', 'thumbnail_height'].filter((key) => key in body)
  expect([0, 3]).toContain(thumbnail.length)
  if (thumbnail.length) {
    positive('thumbnail_width')
    positive('thumbnail_height')
  }
  const known = ['type', 'version', 'html', 'width', 'height', 'title', 'author_name', 'author_url', 'provider_name']
  known.push('provider_url', 'cache_age', 'thumbnail_url', 'thumbnail_width', 'thumbnail_height')
  expect(Object.keys(body).filter((key) => !known.includes(key))).toEqual([])
}

afterEach(() => vi.unstubAllEnvs())

describe('WEB-5: /oembed', () => {
  test('answers a valid rich response for a public project URL, with CORS *', async () => {
    const response = await ask({ url: `${SINGLE}/p/apu/bukit-jalil`, format: 'json' })

    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Content-Type')).toMatch(/^application\/json/)
    const body = await response.json()
    expectRich(body)
    expect(body).toEqual({
      version: '1.0',
      type: 'rich',
      provider_name: 'Skyclause',
      provider_url: `${SINGLE}/`,
      cache_age: 60,
      width: 480,
      height: 200,
      html: `<iframe src="${SINGLE}/embed/apu/bukit-jalil" width="480" height="200" title="Skyclause · bukit-jalil" style="border:0" loading="lazy"></iframe>`,
      thumbnail_url: `${SINGLE}/p/apu/bukit-jalil/og.png`,
      thumbnail_width: 1200,
      thumbnail_height: 630
    })
  })

  test("the project's ledger URL embeds the project, and multi-host mode uses the marketing and embed origins", async () => {
    vi.stubEnv('HOST_MODE', 'multi')
    vi.stubEnv('MARKETING_ORIGIN', 'https://skyclause.m1ku.tech')
    vi.stubEnv('APP_ORIGIN', 'https://app.skyclause.m1ku.tech')
    vi.stubEnv('EMBED_ORIGIN', 'https://embed.skyclause.m1ku.tech')
    const response = await ask(
      { url: 'https://skyclause.m1ku.tech/p/apu/bukit-jalil/ledger' },
      { origin: 'https://skyclause.m1ku.tech' }
    )

    const body = await response.json()
    expectRich(body)
    expect(body.html).toContain('src="https://embed.skyclause.m1ku.tech/apu/bukit-jalil"')
    expect(body.thumbnail_url).toBe('https://skyclause.m1ku.tech/p/apu/bukit-jalil/og.png')
    expect(body.provider_url).toBe('https://skyclause.m1ku.tech/')
  })

  test('maxwidth=320 scales the iframe down, keeping its proportions; larger limits leave it at 480×200', async () => {
    const small = await (await ask({ url: `${SINGLE}/p/apu/bukit-jalil`, maxwidth: '320' })).json()
    expect([small.width, small.height]).toEqual([320, 133])
    expect(small.html).toContain('width="320" height="133"')

    const short = await (await ask({ url: `${SINGLE}/p/apu/bukit-jalil`, maxwidth: '320', maxheight: '100' })).json()
    expect([short.width, short.height]).toEqual([240, 100])

    const roomy = await (await ask({ url: `${SINGLE}/p/apu/bukit-jalil`, maxwidth: '1000', maxheight: '900' })).json()
    expect([roomy.width, roomy.height]).toEqual([480, 200])
  })

  test('404 for an unknown URL, and the same 404 for a private or missing project', async () => {
    const answers = []
    for (const url of [
      'https://example.com/p/apu/bukit-jalil',
      `${SINGLE}/pricing`,
      `${SINGLE}/p/apu`,
      `${SINGLE}/p/apu/private-project`,
      `${SINGLE}/p/apu/no-such-project`
    ]) {
      const response = await ask({ url })
      expect(response.status, url).toBe(404)
      expect(response.headers.get('Access-Control-Allow-Origin'), url).toBe('*')
      answers.push(await response.text())
    }
    expect(new Set(answers.slice(3)).size).toBe(1)
  })

  test("401 for a project's member page, decided by its URL alone", async () => {
    const response = await ask({ url: `${SINGLE}/apu/bukit-jalil/windows` })
    expect(response.status).toBe(401)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  test('501 for format=xml', async () => {
    const response = await ask({ url: `${SINGLE}/p/apu/bukit-jalil`, format: 'xml' })
    expect(response.status).toBe(501)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  test('400 without a url or with a malformed size', async () => {
    expect((await ask({})).status).toBe(400)
    expect((await ask({ url: `${SINGLE}/p/apu/bukit-jalil`, maxwidth: 'wide' })).status).toBe(400)
    expect((await ask({ url: `${SINGLE}/p/apu/bukit-jalil`, maxheight: '0' })).status).toBe(400)
  })

  test('a call URL 404s while its call is private or missing, and is not built past that', async () => {
    expect((await ask({ url: `${SINGLE}/c/0192f0e4-0000-7000-8000-00000000dead` })).status).toBe(404)
    const known = await ask({ url: `${SINGLE}/c/${call().id}` })
    expect(known.status).toBe(501)
    expect((await known.json()).type).toBe('https://docs.skyclause.m1ku.tech/problems/not-built')
  })
})
