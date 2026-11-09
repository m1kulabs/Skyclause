// #159 labelled replay: the evidence pack for 2 November 2026 14:00–16:30 MYT from the stored JPS capture of gauge
// 0232901RF (docs/sources/infobanjirjpskl.water.gov.my/rainfall-graph-75.md), copied byte for byte into
// test/fixtures and loaded by factories. Replay data in a test database only (NFR-15).
import { readFileSync } from 'node:fs'
import { beforeAll, expect, test } from 'vitest'
import { assembleEvidencePack, withSystem, withTenant, type Tx } from '../../src'
import { makeOrganization, makePoll, makeProject, makeProjectSource, makeReading, makeSource } from '../factories'
import { memberOf } from '../harness'

interface JpsCapture {
  stationId: string
  data: Array<{ timestamp: string; rf: number }>
}

const capture = JSON.parse(
  readFileSync(new URL('../fixtures/rainfall-graph-75-20261105T1312Z.json', import.meta.url), 'utf8')
) as JpsCapture
const URL_75 = 'https://infobanjirjpskl.water.gov.my/Rainfall/GetRainfallGraph/75'
// The capture's timestamps are MYT without an offset.
const utc = (myt: string) => new Date(`${myt}+08:00`)

let orgId: string
let projectId: string

beforeAll(async () => {
  orgId = (await makeOrganization()).id
  const gauge = await withSystem('jps-replay', async (tx) => {
    const source = await makeSource(tx, { kind: 'jps_rain', externalId: capture.stationId, url: URL_75 })
    const poll = await makePoll(tx, { sourceId: source.id, startedAt: new Date('2026-11-05T13:12:00Z') })
    for (const row of capture.data.filter((r) => r.timestamp.startsWith('2026-11-02'))) {
      await makeReading(tx, { sourceId: source.id, pollId: poll.id, observedAt: utc(row.timestamp), value: row.rf })
    }
    return source
  })
  projectId = await withTenant({ orgId, principal: memberOf(orgId) }, async (tx: Tx) => {
    const project = await makeProject(tx, { timeZone: 'Asia/Kuala_Lumpur' })
    await makeProjectSource(tx, { projectId: project.id, sourceId: gauge.id, role: 'rain_gauge' })
    return project.id
  })
})

test('replay: 2 Nov 14:00–16:30 MYT lists all 30 five-minute gauge readings, each with its reading ID and source time', async () => {
  const pack = await withTenant({ orgId, principal: memberOf(orgId) }, (tx) =>
    assembleEvidencePack(tx, {
      projectId,
      from: utc('2026-11-02T14:00:00'),
      to: utc('2026-11-02T16:30:00'),
      windowId: null,
      callId: null
    })
  )
  // (14:00, 16:30]: a JPS value at T covers (T − 5 min, T] (D12), so 14:05 to 16:30.
  const expected = capture.data.filter(
    (r) => r.timestamp > '2026-11-02T14:00:00' && r.timestamp <= '2026-11-02T16:30:00'
  )
  expect(expected).toHaveLength(30)
  expect(pack.readings).toHaveLength(30)
  expect(pack.readings.map((r) => [r.observed_at, r.value])).toEqual(
    expected.map((r) => [utc(r.timestamp).toISOString().replace('.000Z', 'Z'), r.rf])
  )
  for (const reading of pack.readings) {
    expect(reading.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(reading).toMatchObject({ station_id: '0232901RF', source_url: URL_75, unit: 'mm', metric: 'rain_5m_mm' })
  }
  expect(pack.readings[0]!.observed_at).toBe('2026-11-02T06:05:00Z')
  expect(pack.readings.at(-1)!.observed_at).toBe('2026-11-02T08:30:00Z')
})
