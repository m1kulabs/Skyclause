import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterEach, expect, test, vi } from 'vitest'
import { createJpsRainAdapter } from '../src/adapters/jps'
import { parseJpsStationList } from '../src/adapters/jps-discovery'
import { HttpError, NetworkError, SchemaError, TimeoutError } from '../src/errors'

const bytes = readFileSync(new URL('./fixtures/rainfall-latest-data-all-20261110T1215Z.html', import.meta.url))
const html = bytes.toString()
const url = 'https://infobanjirjpskl.water.gov.my/Rainfall/LatestData/All'
const response = () => new Response(html)
const transport = () => vi.fn<typeof fetch>().mockImplementation(async () => response())
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

test('reads 49 unique published stations and preserves null coordinates', () => {
  expect(bytes.length).toBe(228937)
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    '2bbe128c892708226c4419a57ce401e57d4933d1feab3e99ed0f5a8254a82d8b'
  )
  const stations = parseJpsStationList(html)
  expect(stations).toHaveLength(49)
  expect(new Set(stations.map((s) => s.externalId)).size).toBe(49)
  expect(new Set(stations.map((s) => s.meta.jps_id)).size).toBe(49)
  expect(stations.find((s) => s.externalId === '0232901RF')).toEqual({
    externalId: '0232901RF',
    name: 'SG. KUYOH DI LRT BUKIT JALIL',
    lat: null,
    lon: null,
    url: 'https://infobanjirjpskl.water.gov.my/Rainfall/GetRainfallGraph/75',
    meta: { jps_id: 75, district: 'Seputeh' }
  })
  expect(stations.every((s) => s.lat === null && s.lon === null && !('state' in s.meta))).toBe(true)
  expect(stations.some((s) => s.name.includes('‐'))).toBe(true)
  expect(stations.every((s) => !s.name.includes('&#'))).toBe(true)
})

// These mutations affect only test copies of the real response.
test.each([
  ['missing table', (s: string) => s.replace('id="Online-rainfalldata"', 'id="renamed"')],
  ['missing tbody', (s: string) => s.replace('<tbody>', '<body>')],
  ['empty external ID', (s: string) => s.replace('0232131RF', '')],
  ['empty name', (s: string) => s.replace(/SG\. KLANG DI JALAN ANG SENG/g, '')],
  ['empty district', (s: string) => s.replace('>Bukit Bintang</td>', '></td>')],
  ['missing station link', (s: string) => s.replace('/Rainfall/Station/73?districtId=0', '/wrong/73')],
  [
    'invalid internal ID',
    (s: string) => s.replace('/Rainfall/Station/73?districtId=0', '/Rainfall/Station/0?districtId=0')
  ],
  ['external ID conflict', (s: string) => s.replace('0232131RF', '0232901RF')],
  [
    'internal ID conflict',
    (s: string) => s.replace('/Rainfall/Station/73?districtId=0', '/Rainfall/Station/75?districtId=0')
  ]
])('rejects %s atomically', (_, mutate) => {
  expect(() => parseJpsStationList(mutate(html))).toThrow(SchemaError)
})

// Review regressions mutate only the selected table in the real capture.
const stationTable = html.match(/<table id="Online-rainfalldata"[^>]*>[\s\S]*?<\/table>/)![0]
const firstStationRow = stationTable.match(/<tbody>\s*(<tr>[\s\S]*?<\/tr>)/)![1]!
const mutateTable = (change: (table: string) => string) => html.replace(stationTable, change(stationTable))

test.each([
  [
    'renamed row wrapper',
    () =>
      mutateTable((table) =>
        table.replace(firstStationRow, firstStationRow.replace('<tr>', '<section>').replace('</tr>', '</section>'))
      )
  ],
  [
    'orphaned station cells',
    () =>
      mutateTable((table) => table.replace(firstStationRow, firstStationRow.replace('<tr>', '').replace('</tr>', '')))
  ],
  [
    'station row before tbody',
    () => mutateTable((table) => table.replace(firstStationRow, '').replace('<tbody>', firstStationRow + '<tbody>'))
  ],
  [
    'station row after tbody',
    () => mutateTable((table) => table.replace(firstStationRow, '').replace('</tbody>', '</tbody>' + firstStationRow))
  ],
  [
    'station row inside thead',
    () => mutateTable((table) => table.replace(firstStationRow, '').replace('</thead>', firstStationRow + '</thead>'))
  ],
  [
    'data-id instead of table id',
    () => mutateTable((table) => table.replace('id="Online-rainfalldata"', 'data-id="Online-rainfalldata"'))
  ],
  [
    'data-href instead of station href',
    () =>
      mutateTable((table) =>
        table.replace('href="/Rainfall/Station/73?districtId=0"', 'data-href="/Rainfall/Station/73?districtId=0"')
      )
  ],
  [
    'station href on a non-anchor element',
    () =>
      mutateTable((table) =>
        table.replace(
          '<a href="/Rainfall/Station/73?districtId=0" target="_blank">1.5</a>',
          '<span href="/Rainfall/Station/73?districtId=0" target="_blank">1.5</span>'
        )
      )
  ]
])('rejects unaccounted station markup: %s', (_, mutate) => {
  expect(() => parseJpsStationList(mutate())).toThrow(SchemaError)
})

test('accepts a genuinely smaller valid catalogue without an expected row count', () => {
  const reduced = parseJpsStationList(mutateTable((table) => table.replace(firstStationRow, '')))
  expect(reduced).toHaveLength(48)
  expect(reduced.some((station) => station.externalId === '0232131RF')).toBe(false)
  expect(reduced[0]!.externalId).toBe('0232051RF')
})

test('does not embed a static catalogue or coordinate pairs in adapter code', () => {
  const code = ['jps.ts', 'jps-parser.ts', 'jps-discovery.ts']
    .map((name) => readFileSync(new URL('../src/adapters/' + name, import.meta.url), 'utf8'))
    .join('\n')
  expect(code).not.toMatch(/\b\d+\.\d+\s*,\s*\d+\.\d+\b/)
  expect(code).not.toMatch(/0232901RF|KUYOH|fixtures|readFile/)
})

test('discovery sends one bounded manual-redirect HTML GET with configured User-Agent', async () => {
  vi.stubEnv('ADAPTER_USER_AGENT', 'environment-agent')
  const http = transport()
  const adapter = createJpsRainAdapter({ discoveryHttp: http, userAgent: 'configured-agent' })
  expect(await adapter.discover!()).toHaveLength(49)
  expect(http).toHaveBeenCalledTimes(1)
  const [requested, options] = http.mock.calls[0]!
  expect(requested).toBe(url)
  expect(options).toMatchObject({
    method: 'GET',
    redirect: 'manual',
    headers: { Accept: 'text/html', 'User-Agent': 'configured-agent' }
  })
  expect(options!.signal).toBeInstanceOf(AbortSignal)
})

test.each([302, 500])('reports HTTP %i without retry or following a redirect', async (status) => {
  const http = transport().mockResolvedValue(new Response('', { status }))
  const failure = await createJpsRainAdapter({ discoveryHttp: http, userAgent: 'test-agent' }).discover!().catch(
    (e) => e
  )
  expect(failure).toBeInstanceOf(HttpError)
  expect(failure).toMatchObject({ status, url })
  expect(http).toHaveBeenCalledTimes(1)
})

test('reports network and malformed HTML failures visibly without retry', async () => {
  const http = transport().mockRejectedValue(new TypeError('offline'))
  await expect(
    createJpsRainAdapter({ discoveryHttp: http, userAgent: 'test-agent' }).discover!()
  ).rejects.toBeInstanceOf(NetworkError)
  expect(http).toHaveBeenCalledTimes(1)
  http.mockClear().mockResolvedValue(new Response('<html>upstream changed</html>'))
  await expect(
    createJpsRainAdapter({ discoveryHttp: http, userAgent: 'test-agent' }).discover!()
  ).rejects.toBeInstanceOf(SchemaError)
  expect(http).toHaveBeenCalledTimes(1)
})

test.each(['headers', 'body'])('enforces the whole 60-second deadline while waiting for %s', async (phase) => {
  vi.useFakeTimers()
  let signal: AbortSignal | null | undefined
  const http = transport().mockImplementation(async (_, options) => {
    signal = options!.signal
    if (phase === 'headers') return new Promise<Response>(() => {})
    return { ok: true, status: 200, text: () => new Promise<string>(() => {}) } as Response
  })
  const pending = createJpsRainAdapter({ discoveryHttp: http, userAgent: 'test-agent' }).discover!()
  const rejected = expect(pending).rejects.toBeInstanceOf(TimeoutError)
  await vi.advanceTimersByTimeAsync(59999)
  expect(signal!.aborted).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  await rejected
  expect(signal!.aborted).toBe(true)
  expect(http).toHaveBeenCalledTimes(1)
})

test.each([undefined, '', '   '])('missing or blank User-Agent fails before HTTP: %s', async (userAgent) => {
  vi.stubEnv('ADAPTER_USER_AGENT', '')
  const http = transport()
  await expect(createJpsRainAdapter({ discoveryHttp: http, userAgent }).discover!()).rejects.toThrow(
    /ADAPTER_USER_AGENT/
  )
  expect(http).not.toHaveBeenCalled()
})

test('construction and fresh module import read neither environment nor network; execution resolves defaults', async () => {
  const http = transport()
  vi.stubGlobal('fetch', http)
  const original = process.env
  let envReads = 0
  const environment = new Proxy(original, {
    get(target, key) {
      if (key === 'ADAPTER_USER_AGENT') {
        envReads++
        return 'lazy-agent'
      }
      return Reflect.get(target, key)
    }
  })
  process.env = environment
  try {
    vi.resetModules()
    const { createJpsRainAdapter: freshFactory } = await import('../src/adapters/jps')
    const adapter = freshFactory()
    expect(envReads).toBe(0)
    expect(http).not.toHaveBeenCalled()
    expect(await adapter.discover!()).toHaveLength(49)
    expect(envReads).toBe(1)
    expect(http.mock.calls[0]![1]!.headers).toMatchObject({ 'User-Agent': 'lazy-agent' })
  } finally {
    process.env = original
  }
})
