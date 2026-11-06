import { createHash } from 'node:crypto'
import { describe, expect, test } from 'bun:test'
import { defaultSkyClauseRows } from './clauses.ts'
import type { PlannedSkyCrossingFile } from './crossings.ts'
import { computeSkySnapshot } from './indicators.ts'
import { JPS_REPLAY_CAPTURE } from './replay-data.ts'
import { runSkyReplay } from './replay.ts'
import type { Row } from './schema.ts'
import { runSkyClauseTick, type SkyClauseRuntimePorts, type SkyClauseReadTab } from './sky-runtime.ts'
import { runSweep, type SweepPorts } from './sweep.ts'

const SNAPSHOT = '2026-11-02T15:05:00+08:00'
const DAYLIGHT = { start: '07:15', end: '19:00' }
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')
function canonicalJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize)
    if (item !== null && typeof item === 'object') {
      return Object.fromEntries(
        Object.entries(item)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, val]) => [key, normalize(val)])
      )
    }
    return item
  }
  return JSON.stringify(normalize(value))
}

type LiveContext = {
  indicators: Row<'indicators'>[]
  windows: Row<'windows'>[]
  versions: Row<'clause_versions'>[]
}

// Every invocation owns a fresh unsealed call. A matching Sent message makes CAL-3 run immediately.
function sweepNotice(file: PlannedSkyCrossingFile, scope: string, body: string, live: LiveContext) {
  const subject = 'Sky integration notice'
  const callId = 'integration-call'
  const row: Row<'ledger'> = {
    entry_id: `${callId}:call_approved`,
    kind: 'call_approved',
    call_id: callId,
    pack: 'sky',
    'window_id or night_id': scope,
    snapshot_id: file.document.snapshot_id,
    source_ref: file.document.replay ? file.filename : file.document.crossing_id,
    body: JSON.stringify({ notice: { subject, body } })
  }
  const raw = { id: 'integration-file', name: file.filename, text: JSON.stringify(file.document) }
  const notifications: Row<'notifications'>[] = []
  const mails: { subject: string; body: string }[] = []
  const ports: SweepPorts = {
    now: () => new Date('2026-11-02T15:20:00+08:00'),
    sha256Hex: sha256,
    skyFiles: () => (file.document.replay ? [] : [raw]),
    crowdFiles: () => [],
    replayFiles: () => (file.document.replay ? [raw] : []),
    rota: () => [],
    notifications: () => [...notifications],
    ledger: () => [row],
    indicators: () => live.indicators,
    windows: () => live.windows,
    clauseVersions: () => live.versions,
    shadow: () => [],
    sent: () => [{ subject, date: '2026-11-02T15:19:00+08:00' }],
    calendarDescription: () => null,
    appendCalendarDescription: () => {},
    teamAlertEmails: () => ['integration@example.com'],
    sendMail: (_to, subject, body) => {
      mails.push({ subject, body })
      return `message-${mails.length}`
    },
    appendNotification: (notification) => {
      notifications.push(notification)
    },
    fillLedger: (_index, cells) => {
      Object.assign(row, cells)
    }
  }
  const result = runSweep(ports)
  expect(result.waiting).toEqual([])
  expect(result.sealed).toEqual([2])
  expect(row.sent_at).toBe('2026-11-02T15:19:00+08:00')
  expect(row.hash).toMatch(/^[a-f0-9]{64}$/)
  return { result, notifications, mails }
}

function expectMismatch(check: ReturnType<typeof sweepNotice>, number: number) {
  expect(check.result.mismatches).toEqual([{ callId: 'integration-call', number, line: expect.any(String) }])
  expect(check.notifications.filter((row) => row.kind === 'cal3_mismatch')).toHaveLength(1)
  expect(check.mails.find((mail) => mail.subject.startsWith('CAL-3 mismatch:'))?.body).toContain(`Number: ${number}`)
}

function produceReplay() {
  const before = JSON.stringify(JPS_REPLAY_CAPTURE)
  const files: PlannedSkyCrossingFile[] = []
  const result = runSkyReplay(
    {
      capture: JPS_REPLAY_CAPTURE,
      subscriberIds: ['S-integration'],
      recordedAt: '2026-11-07T09:15:00+08:00',
      daylight: DAYLIGHT
    },
    {
      canonicalJson,
      sha256,
      replaceWindows: () => {},
      replaceClauses: () => {},
      nextSequence: () => 1,
      createCrossing: (file) => {
        files.push(structuredClone(file))
      },
      report: () => {}
    }
  )
  expect(JSON.stringify(JPS_REPLAY_CAPTURE)).toBe(before)
  expect(result.tickCount).toBe(288)
  const file = files.find((file) => file.filename === 'crossing-20261102-1505-01.json')
  if (!file) throw new Error('Replay did not produce the worked-example 15:05 crossing')
  const wave = file.document.changes.find((change) => change.window?.end_myt === '15:30')
  if (!wave) throw new Error('Replay crossing omitted the 15:30 release wave')
  expect(wave.inputs.find((input) => input.name === 'w.rain_max_60m_mm')).toMatchObject({ value: 39, age_min: 5 })
  expect(file.document.clause_version).toBe(result.clauseVersion)
  return { file, scope: wave.scope }
}

function conflictingLive(scope: string): LiveContext {
  return {
    indicators: [{ snapshot_id: SNAPSHOT, scope, name: 'live_only', value: 777, age_min: 888 }],
    windows: [{ window_id: scope, date: '2026-11-04', start_myt: '23:47', end_myt: '23:47' }],
    versions: [
      { version_n: 1, saved_at: '2026-11-01T00:00:00+08:00', content_json: JSON.stringify([{ threshold: 999 }]) }
    ]
  }
}

describe('Sky producers → CAL-3 sweep', () => {
  test('an edited live crossing pins the new version saved after its fixed poll snapshot', () => {
    const window: Row<'windows'> = {
      window_id: 'W-integration',
      subscriber_id: 'S-integration',
      kind: 'commute_wave',
      date: '2026-11-02',
      start_myt: '15:30',
      end_myt: '15:30',
      status: 'active'
    }
    const snapshot = computeSkySnapshot({
      tEval: SNAPSHOT,
      daylight: DAYLIGHT,
      windows: [window],
      warnings: [],
      forecast: [],
      sources: [
        {
          source_id: JPS_REPLAY_CAPTURE.stationId,
          kind: 'jps_rain',
          cadence_min: 5,
          stale_after_min: 10,
          freshness: 'observed',
          state: 'fresh',
          probation: false
        }
      ],
      readings: JPS_REPLAY_CAPTURE.data
        .filter((point) => point.timestamp <= '2026-11-02T15:00:00')
        .map((point) => ({
          reading_id: `integration-${point.timestamp}`,
          source_kind: 'jps_rain',
          source_id: JPS_REPLAY_CAPTURE.stationId,
          metric: 'rain_5m_mm',
          observed_at: `${point.timestamp}+08:00`,
          received_at: SNAPSHOT,
          value: point.rf,
          unit: 'mm',
          revision: 1
        })),
      polls: [
        {
          source_kind: 'jps_rain',
          source_id: JPS_REPLAY_CAPTURE.stationId,
          started_at: SNAPSHOT,
          received_at: SNAPSHOT,
          outcome: 'ok'
        }
      ]
    })
    const tables: { [T in SkyClauseReadTab | 'shadow']: Row<T>[] } = {
      clauses: defaultSkyClauseRows().map((row) => ({
        ...row,
        enabled: row.key === 'storm_confirmed',
        ...(row.key === 'storm_confirmed' ? { threshold: 83 } : {})
      })),
      clause_versions: [],
      ledger: [],
      shadow_state: [],
      shadow: []
    }
    const files: PlannedSkyCrossingFile[] = []
    const ports: SkyClauseRuntimePorts = {
      canonicalJson,
      sha256,
      listCrossings: () => files,
      createCrossing: (file) => {
        files.push(structuredClone(file))
      },
      store: {
        readRows<T extends SkyClauseReadTab>(tab: T): readonly Row<T>[] {
          return structuredClone(tables[tab]) as readonly Row<T>[]
        },
        appendRows(tab, rows) {
          ;(tables[tab] as Row<typeof tab>[]).push(...structuredClone(rows))
        },
        replaceRows(tab, rows) {
          tables[tab] = structuredClone([...rows])
        }
      }
    }
    const input = {
      tEval: SNAPSHOT,
      recordedAt: '2026-11-02T15:05:01+08:00',
      editor: 'test-editor',
      snapshot,
      windows: [window]
    }
    const first = runSkyClauseTick(input, ports)
    expect(first.version.version_n).toBe(1)
    expect(files).toHaveLength(0)
    const storm = tables.clauses.find((row) => row.key === 'storm_confirmed')!
    storm.threshold = 37
    const second = runSkyClauseTick({ ...input, recordedAt: '2026-11-02T15:05:10+08:00' }, ports)
    expect(second.fileCreated).toBe(true)
    expect(files).toHaveLength(1)
    const file = files[0]!
    expect(file.document).toMatchObject({ clause_version: 2, snapshot_id: SNAPSHOT, t_eval: SNAPSHOT, replay: false })
    expect(second.version.saved_at).toBe('2026-11-02T15:05:10+08:00')
    const metadataBefore = structuredClone({ versions: tables.clause_versions, document: file.document })
    const live = { indicators: snapshot.indicatorRows, windows: [window], versions: tables.clause_versions }
    expect(sweepNotice(file, 'W-integration', 'Threshold 37 mm.', live).result.mismatches).toEqual([])
    expectMismatch(sweepNotice(file, 'W-integration', 'Threshold 83 mm.', live), 83)
    expect({ versions: tables.clause_versions, document: file.document }).toEqual(metadataBefore)
  })

  test('the real replay file supplies its own thresholds, measurements, ages and release-wave times', () => {
    const { file, scope } = produceReplay()
    const content = file.document.replay_clause_content_json
    expect(typeof content).toBe('string')
    expect(file.document.clause_version).toBe(`replay:${sha256(content!)}`)
    expect(file.document.replay_notice).toBe('haze clauses off: no APIMS record for 2 Nov')
    const live = conflictingLive(scope)
    expect(
      sweepNotice(file, scope, 'Threshold 31 mm; rain 39.0 mm, age 5 min; release 15:30.', live).result.mismatches
    ).toEqual([])
    expectMismatch(sweepNotice(file, scope, 'Rain 39.5 mm.', live), 39.5)
    expectMismatch(sweepNotice(file, scope, 'Rain 777 mm.', live), 777)
  })

  test('tampering with replay clause bytes removes threshold authority while preserving trace evidence', () => {
    const { file, scope } = produceReplay()
    const live = conflictingLive(scope)
    // Even a live version containing this threshold cannot repair an invalid replay hash.
    live.versions[0]!.content_json = JSON.stringify([{ threshold: 31 }])
    expect(sweepNotice(file, scope, 'Threshold 31 mm.', live).result.mismatches).toEqual([])
    const tampered = structuredClone(file)
    tampered.document.replay_clause_content_json += ' '
    expect(tampered.document.clause_version).toBe(file.document.clause_version)
    expect(sweepNotice(tampered, scope, 'Rain 39.0 mm, age 5 min; release 15:30.', live).result.mismatches).toEqual([])
    expectMismatch(sweepNotice(tampered, scope, 'Threshold 31 mm.', live), 31)
  })
})
