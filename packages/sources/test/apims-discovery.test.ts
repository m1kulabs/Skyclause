import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { expect, test, vi } from 'vitest'
import { discoverApims } from '../src/adapters/apims-discovery'
import { createApimsAdapter } from '../src/adapters/apims'
import { SchemaError } from '../src/errors'

const bytes = readFileSync(new URL('./fixtures/mapcaqm-20261105T1313Z.json', import.meta.url))
const body = () => JSON.parse(bytes.toString())
test('catalogue contains 68 stations', () => {
  expect(bytes.length).toBe(17031)
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    'f530883dc9ca9dcc7fe798efb613e710d0a9ec7e8bf0d694e4526d8b9d4d9a56'
  )
  const stations = discoverApims(body())
  expect(stations).toHaveLength(68)
  const cheras = stations.find((s) => s.externalId === 'CA16W')!
  expect(cheras).toMatchObject({
    name: 'Cheras, W.P. KUALA LUMPUR',
    lat: 3.10626,
    lon: 101.717931,
    meta: { state_id: 14, state_name: 'WP Kuala Lumpur', station_status: 1 },
    staleAfterS: 7200,
    url: 'https://eqms.doe.gov.my/api3/publicportalapims/mapcaqm'
  })
  const rad = (n: number) => (n * Math.PI) / 180
  const a =
    Math.sin(rad(cheras.lat! - 3.0559) / 2) ** 2 +
    Math.cos(rad(3.0559)) * Math.cos(rad(cheras.lat!)) * Math.sin(rad(cheras.lon! - 101.6997) / 2) ** 2
  expect((6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2)).toBe('5.95')
})
test('canonical APIMS discovery never performs HTTP', () => {
  const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'))
  try {
    const adapter = createApimsAdapter()
    expect(adapter).not.toHaveProperty('discover')
    expect(adapter.latestSlot!.discover!(bytes)).toEqual(discoverApims(body()))
    expect(adapter.latestSlot!.decode(bytes)).toEqual({ kind: 'latest', body: body() })
    expect(network).not.toHaveBeenCalled()
    expect(() => adapter.latestSlot!.decode(new TextEncoder().encode('invalid'))).toThrow(SchemaError)
  } finally {
    network.mockRestore()
  }
})
test.each([
  { STATION_ID: '' },
  { STATION_ID: null },
  { STATION_LOCATION: '' },
  { STATE_NAME: null },
  { STATE_ID: '14' },
  { STATE_ID: 0 },
  { STATE_ID: 1.5 },
  { STATE_ID: Number.MAX_SAFE_INTEGER + 1 },
  { LATITUDE: null },
  { LATITUDE: '3' },
  { LATITUDE: 91 },
  { LONGITUDE: -181 },
  { LONGITUDE: Infinity },
  { ID: 0 },
  { STATION_STATUS: null }
])('rejects the whole malformed catalogue atomically %j', (change) => {
  const raw = body(),
    before = structuredClone(raw)
  Object.assign(raw.data[0], change)
  const changed = structuredClone(raw)
  expect(() => discoverApims(raw)).toThrow(SchemaError)
  expect(raw).toEqual(changed)
  expect(discoverApims(before)).toHaveLength(68)
})
test('rejects empty, malformed and duplicate catalogue rows and does not mutate valid input', () => {
  for (const raw of [null, {}, { data: [] }, { data: [null] }]) expect(() => discoverApims(raw)).toThrow(SchemaError)
  const raw = body(),
    before = structuredClone(raw)
  expect(discoverApims(raw)).toHaveLength(68)
  expect(raw).toEqual(before)
  raw.data.push(raw.data[0])
  expect(() => discoverApims(raw)).toThrow(SchemaError)
})
