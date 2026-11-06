import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, test } from 'bun:test'
import { defaultSkyClauseRows } from './clauses.ts'
import type { PlannedSkyCrossingFile } from './crossings.ts'
import { BOUND_APIMS_STATION_IDS, type DaylightWindow } from './indicators.ts'
import { JPS_SOURCE_ID } from './jps.ts'
import { runSkyReplay, selectReplaySubscriberIds, type SkyReplayCapture, type SkyReplayPorts } from './replay.ts'
import type { Row } from './schema.ts'

const FIXTURE_URL = new URL('../../fixtures/rainfall-graph-75-20261105T1312Z.json', import.meta.url)
const FIXTURE_PATH = fileURLToPath(FIXTURE_URL)
const KNOWN_FIXTURE_SHA256 = '25cae3be496cff29b9925595d23fc63b7ddf9c1a4fb29e22b806b00d4ed3bd95'
const MISSING_APIMS_NOTICE = 'haze clauses off: no APIMS record for 2 Nov'
const RECORDED_AT = '2026-11-07T09:15:00+08:00'
const DAYLIGHT: DaylightWindow = { start: '07:15', end: '19:00' }

function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeValue(item))
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(record).sort()) {
      sorted[key] = canonicalizeValue(record[key])
    }
    return sorted
  }
  return value
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalizeValue(value))
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function loadRawFixture(): SkyReplayCapture {
  const raw = JSON.parse(readFileSync(FIXTURE_URL, 'utf8')) as SkyReplayCapture
  return raw
}

function loadNov2Capture(): SkyReplayCapture {
  const raw = loadRawFixture()
  return {
    stationId: raw.stationId,
    data: raw.data.filter((entry) => String(entry.timestamp).startsWith('2026-11-02')).map((entry) => ({ ...entry }))
  }
}

interface ReplayHarness {
  ports: SkyReplayPorts
  getWindows(): Row<'windows'>[]
  getClauses(): Row<'clauses'>[]
  getFiles(): PlannedSkyCrossingFile[]
  getReports(): string[]
  getCounts(): {
    replaceWindows: number
    replaceClauses: number
    nextSequence: number
    createCrossing: number
  }
}

function createReplayHarness(existingFiles: PlannedSkyCrossingFile[] = []): ReplayHarness {
  let storedWindows: Row<'windows'>[] = []
  let storedClauses: Row<'clauses'>[] = []
  const files: PlannedSkyCrossingFile[] = existingFiles.map((file) => structuredClone(file))
  const reports: string[] = []
  const counts = {
    replaceWindows: 0,
    replaceClauses: 0,
    nextSequence: 0,
    createCrossing: 0
  }

  const ports: SkyReplayPorts = {
    replaceWindows(rows) {
      counts.replaceWindows += 1
      storedWindows = rows.map((row) => ({ ...row }))
    },
    replaceClauses(rows) {
      counts.replaceClauses += 1
      storedClauses = rows.map((row) => ({ ...row }))
    },
    nextSequence(proposedFilename) {
      counts.nextSequence += 1
      const match = /^crossing-(\d{8}-\d{4})-(\d+)\.json$/.exec(proposedFilename.trim())
      if (!match) {
        throw new Error(`Invalid proposed crossing filename: ${proposedFilename}`)
      }
      const stamp = match[1]!
      let maxSeq = 0
      for (const existing of files) {
        const existingMatch = /^crossing-(\d{8}-\d{4})-(\d+)\.json$/.exec(existing.filename.trim())
        if (existingMatch && existingMatch[1] === stamp) {
          const seq = Number.parseInt(existingMatch[2]!, 10)
          if (seq > maxSeq) maxSeq = seq
        }
      }
      return maxSeq + 1
    },
    createCrossing(file) {
      counts.createCrossing += 1
      if (files.some((existing) => existing.filename === file.filename)) {
        throw new Error(`Duplicate crossing filename: ${file.filename}`)
      }
      files.push(structuredClone(file))
    },
    canonicalJson,
    sha256,
    report(message) {
      reports.push(message)
    }
  }

  return {
    ports,
    getWindows: () => storedWindows,
    getClauses: () => storedClauses,
    getFiles: () => files,
    getReports: () => reports,
    getCounts: () => ({ ...counts })
  }
}

function buildHourlyApimsReadings(value = 52): Row<'readings'>[] {
  const timestamps = ['2026-11-01T23:00:00+08:00']
  for (let hour = 0; hour < 24; hour += 1) {
    const hh = String(hour).padStart(2, '0')
    timestamps.push(`2026-11-02T${hh}:00:00+08:00`)
  }

  const rows: Row<'readings'>[] = []
  for (const observedAt of timestamps) {
    for (const stationId of BOUND_APIMS_STATION_IDS) {
      rows.push({
        reading_id: `${stationId}:api:${observedAt}`,
        source_kind: 'apims',
        source_id: stationId,
        metric: 'api',
        observed_at: observedAt,
        received_at: observedAt,
        value,
        unit: 'API',
        http_status: 200,
        latency_ms: 100,
        poll_id: `apims-poll-${observedAt}`,
        revision: 1
      })
    }
  }
  return rows
}

describe('Sky replay (#55 Stage 5)', () => {
  test('1. streams real 2 Nov fixture slice across 288 ticks with 4 worked-example waves and no mutation of inputs', () => {
    const capture = loadNov2Capture()
    expect(capture.stationId).toBe(JPS_SOURCE_ID)
    expect(capture.data).toHaveLength(288)
    expect(capture.data[0]?.timestamp).toBe('2026-11-02T00:00:00')
    expect(capture.data[287]?.timestamp).toBe('2026-11-02T23:55:00')

    const captureBefore = structuredClone(capture)
    const clausesInput = defaultSkyClauseRows().map((row) => ({ ...row }))
    const clausesBefore = structuredClone(clausesInput)
    const harness = createReplayHarness()

    expect(Object.keys(harness.ports).sort()).toEqual([
      'canonicalJson',
      'createCrossing',
      'nextSequence',
      'replaceClauses',
      'replaceWindows',
      'report',
      'sha256'
    ])

    const result = runSkyReplay(
      {
        capture,
        subscriberIds: ['sub-ops-01'],
        recordedAt: RECORDED_AT,
        daylight: DAYLIGHT,
        clauses: clausesInput
      },
      harness.ports
    )

    expect(result.tickCount).toBe(288)
    expect(result.windows).toHaveLength(4)
    expect(harness.getWindows()).toEqual(result.windows)
    expect(harness.getClauses()).toEqual(result.clauses)

    const waveTimes = result.windows.map((w) => ({
      subscriber_id: w.subscriber_id,
      kind: w.kind,
      date: w.date,
      start_myt: w.start_myt,
      end_myt: w.end_myt,
      language: w.language,
      declared_at: w.declared_at,
      title: w.title
    }))

    expect(waveTimes).toEqual([
      {
        subscriber_id: 'sub-ops-01',
        kind: 'commute_wave',
        date: '2026-11-02',
        start_myt: '14:30',
        end_myt: '14:30',
        language: 'en',
        declared_at: RECORDED_AT,
        title: 'Replay (2 Nov 2026) release wave'
      },
      {
        subscriber_id: 'sub-ops-01',
        kind: 'commute_wave',
        date: '2026-11-02',
        start_myt: '15:00',
        end_myt: '15:00',
        language: 'en',
        declared_at: RECORDED_AT,
        title: 'Replay (2 Nov 2026) release wave'
      },
      {
        subscriber_id: 'sub-ops-01',
        kind: 'commute_wave',
        date: '2026-11-02',
        start_myt: '15:30',
        end_myt: '15:30',
        language: 'en',
        declared_at: RECORDED_AT,
        title: 'Replay (2 Nov 2026) release wave'
      },
      {
        subscriber_id: 'sub-ops-01',
        kind: 'commute_wave',
        date: '2026-11-02',
        start_myt: '15:45',
        end_myt: '15:45',
        language: 'en',
        declared_at: RECORDED_AT,
        title: 'Replay (2 Nov 2026) release wave'
      }
    ])

    expect(capture).toEqual(captureBefore)
    expect(clausesInput).toEqual(clausesBefore)
  })

  test('2. disables both haze rows when 2 Nov APIMS history is absent, labels files/reports, blocks MET, and crosses waves at 15:05 and 15:20', () => {
    const capture = loadNov2Capture()
    const harness = createReplayHarness()

    const result = runSkyReplay(
      {
        capture,
        subscriberIds: ['sub-ops-01'],
        recordedAt: RECORDED_AT,
        daylight: DAYLIGHT
      },
      harness.ports
    )

    expect(result.notice).toBe(MISSING_APIMS_NOTICE)
    expect(result.clauseVersion).toMatch(/^replay:[0-9a-f]{64}$/)

    const hazeWatchRow = result.clauses.find((row) => row.key === 'haze_watch')
    const hazeSevereRow = result.clauses.find((row) => row.key === 'haze_severe')
    const stormWatchRow = result.clauses.find((row) => row.key === 'storm_watch')
    const stormConfirmedRow = result.clauses.find((row) => row.key === 'storm_confirmed')
    expect(hazeWatchRow?.enabled).toBe(false)
    expect(hazeSevereRow?.enabled).toBe(false)
    expect(stormWatchRow?.enabled).toBe(true)
    expect(stormConfirmedRow?.enabled).toBe(true)

    expect(result.files.length).toBeGreaterThanOrEqual(2)
    for (const file of result.files) {
      expect(file.document.replay).toBe(true)
      expect(file.document.replay_notice).toBe(MISSING_APIMS_NOTICE)
      expect(file.document.clause_version).toBe(result.clauseVersion)
      expect(typeof file.document.replay_clause_content_json).toBe('string')
      const content = file.document.replay_clause_content_json!
      expect(`replay:${sha256(content)}`).toBe(result.clauseVersion)
      const config = JSON.parse(content) as Row<'clauses'>[]
      expect(config).toHaveLength(result.clauses.length)
      for (let i = 0; i < config.length; i++) expect(config[i]).toMatchObject(result.clauses[i]!)
    }

    const reports = harness.getReports()
    expect(reports.length).toBeGreaterThan(0)
    for (const report of reports) {
      expect(report.startsWith('Replay (2 Nov 2026):')).toBe(true)
      expect(report).toContain(MISSING_APIMS_NOTICE)
    }

    const filesBefore1505 = result.files.filter(
      (file) => Date.parse(file.document.t_eval) < Date.parse('2026-11-02T15:05:00+08:00')
    )
    expect(filesBefore1505).toHaveLength(0)

    const crossing1505 = result.files.find((file) => file.filename === 'crossing-20261102-1505-01.json')
    expect(crossing1505).toBeDefined()
    expect(crossing1505?.document.crossing_id).toBe('X-20261102-1505-01')
    expect(crossing1505?.document.t_eval).toBe('2026-11-02T15:05:00+08:00')
    expect(crossing1505?.document.changes).toHaveLength(3)
    expect(crossing1505?.document.changes.map((c) => c.window?.end_myt)).toEqual(['14:30', '15:00', '15:30'])

    for (const change of crossing1505?.document.changes ?? []) {
      expect(change.from).toBe('normal')
      expect(change.to).toBe('commute_disruption')
      expect(change.fired).toEqual(['storm_confirmed'])
      expect(change.blocked).toContain('storm_watch')
      const rainInput = change.inputs.find((inp) => inp.name === 'w.rain_max_60m_mm')
      expect(rainInput).toBeDefined()
      expect(rainInput?.value).toBe(39)
      expect(rainInput?.observed_at).toBe('2026-11-02T15:00:00+08:00')
      expect(rainInput?.age_min).toBe(5)
      expect(rainInput?.source_id).toBe(JPS_SOURCE_ID)
    }

    const crossing1520 = result.files.find((file) => file.filename === 'crossing-20261102-1520-01.json')
    expect(crossing1520).toBeDefined()
    expect(crossing1520?.document.crossing_id).toBe('X-20261102-1520-01')
    expect(crossing1520?.document.t_eval).toBe('2026-11-02T15:20:00+08:00')
    expect(crossing1520?.document.changes).toHaveLength(1)
    expect(crossing1520?.document.changes[0]?.window?.end_myt).toBe('15:45')
    expect(crossing1520?.document.changes[0]?.from).toBe('normal')
    expect(crossing1520?.document.changes[0]?.to).toBe('commute_disruption')
    expect(crossing1520?.document.changes[0]?.fired).toEqual(['storm_confirmed'])
    expect(crossing1520?.document.changes[0]?.blocked).toContain('storm_watch')
  })

  test('3. honors received_at availability for optional APIMS readings, rejects 5 Nov retimestamping, and errors on invalid provenance', () => {
    const capture = loadNov2Capture()
    const baseApims = buildHourlyApimsReadings(52)
    const lateRevision: Row<'readings'> = {
      reading_id: 'CA16W:api:2026-11-02T15:00:00+08:00:r2',
      source_kind: 'apims',
      source_id: 'CA16W',
      metric: 'api',
      observed_at: '2026-11-02T15:00:00+08:00',
      received_at: '2026-11-02T15:10:00+08:00',
      value: 200,
      unit: 'API',
      http_status: 200,
      latency_ms: 95,
      poll_id: 'apims-poll-1510-rev2',
      revision: 2
    }

    const harness = createReplayHarness()
    const result = runSkyReplay(
      {
        capture,
        subscriberIds: ['sub-ops-01'],
        recordedAt: RECORDED_AT,
        daylight: DAYLIGHT,
        apimsReadings: [...baseApims, lateRevision]
      },
      harness.ports
    )

    expect(result.notice).toBeNull()
    expect(result.clauses.find((row) => row.key === 'haze_watch')?.enabled).toBe(true)
    expect(result.clauses.find((row) => row.key === 'haze_severe')?.enabled).toBe(true)

    const crossing1505 = result.files.find((file) => file.filename === 'crossing-20261102-1505-01.json')
    expect(crossing1505).toBeDefined()
    expect(crossing1505?.document.replay_notice).toBeUndefined()
    expect(crossing1505?.document.changes.some((change) => change.scope === 'site')).toBe(false)
    for (const change of crossing1505?.document.changes ?? []) {
      expect(change.fired).not.toContain('haze_watch')
      expect(change.fired).not.toContain('haze_severe')
    }

    const crossing1510 = result.files.find((file) => file.filename === 'crossing-20261102-1510-01.json')
    expect(crossing1510).toBeDefined()
    const siteChange1510 = crossing1510?.document.changes.find((change) => change.scope === 'site')
    expect(siteChange1510).toBeDefined()
    expect(siteChange1510?.fired).toContain('haze_watch')
    expect(siteChange1510?.inputs.find((inp) => inp.name === 'site.api_max')?.value).toBe(200)

    // A 5 Nov-only APIMS capture is not 2 Nov history and cannot be retimestamped into 2 Nov.
    const nov5OnlyApims: Row<'readings'>[] = BOUND_APIMS_STATION_IDS.map((stationId) => ({
      reading_id: `${stationId}:api:2026-11-05T15:00:00+08:00`,
      source_kind: 'apims',
      source_id: stationId,
      metric: 'api',
      observed_at: '2026-11-05T15:00:00+08:00',
      received_at: '2026-11-05T15:05:00+08:00',
      value: 240,
      unit: 'API',
      http_status: 200,
      latency_ms: 90,
      poll_id: 'apims-poll-nov5',
      revision: 1
    }))

    const nov5Harness = createReplayHarness()
    const nov5Result = runSkyReplay(
      {
        capture,
        subscriberIds: ['sub-ops-01'],
        recordedAt: RECORDED_AT,
        daylight: DAYLIGHT,
        apimsReadings: nov5OnlyApims
      },
      nov5Harness.ports
    )
    expect(nov5Result.notice).toBe(MISSING_APIMS_NOTICE)
    expect(nov5Result.clauses.find((row) => row.key === 'haze_watch')?.enabled).toBe(false)
    expect(nov5Result.clauses.find((row) => row.key === 'haze_severe')?.enabled).toBe(false)

    // Invalid timestamp/provenance in supplied APIMS readings must throw rather than fabricate data.
    const invalidApimsCases: Row<'readings'>[][] = [
      [{ ...baseApims[0]!, observed_at: '2026-11-02T15:00:00' }],
      [{ ...baseApims[0]!, received_at: '2026-11-02T15:05:00' }],
      [{ ...baseApims[0]!, received_at: '' }],
      [{ ...baseApims[0]!, source_id: 'UNKNOWN_STATION' }],
      [{ ...baseApims[0]!, reading_id: '' }],
      [{ ...baseApims[0]!, value: Number.NaN }]
    ]

    for (const invalidApims of invalidApimsCases) {
      const badHarness = createReplayHarness()
      expect(() =>
        runSkyReplay(
          {
            capture,
            subscriberIds: ['sub-ops-01'],
            recordedAt: RECORDED_AT,
            daylight: DAYLIGHT,
            apimsReadings: invalidApims
          },
          badHarness.ports
        )
      ).toThrow()
      expect(badHarness.getFiles()).toHaveLength(0)
    }
  })

  test('4. creates 4 deterministic opaque waves per subscriber and rejects invalid IDs or malformed captures before writes', () => {
    const capture = loadNov2Capture()
    const harnessA = createReplayHarness()
    const harnessB = createReplayHarness()

    const resultA = runSkyReplay(
      {
        capture,
        subscriberIds: ['sub-alpha', 'sub-beta'],
        recordedAt: RECORDED_AT,
        daylight: DAYLIGHT
      },
      harnessA.ports
    )

    const resultB = runSkyReplay(
      {
        capture,
        subscriberIds: ['sub-alpha', 'sub-beta'],
        recordedAt: RECORDED_AT,
        daylight: DAYLIGHT
      },
      harnessB.ports
    )

    expect(resultA.windows).toHaveLength(8)
    expect(resultA.windows.map((w) => w.window_id)).toEqual(resultB.windows.map((w) => w.window_id))
    const uniqueScopeIds = new Set(resultA.windows.map((w) => String(w.window_id)))
    expect(uniqueScopeIds.size).toBe(8)
    for (const row of resultA.windows) {
      expect(String(row.window_id)).not.toContain('@')
      expect(String(row.subscriber_id)).not.toContain('@')
    }

    const crossing1505 = resultA.files.find((f) => f.filename === 'crossing-20261102-1505-01.json')
    expect(crossing1505?.document.changes).toHaveLength(6)

    const rawFixture = loadRawFixture()
    const nov5Slice: SkyReplayCapture = {
      stationId: rawFixture.stationId,
      data: rawFixture.data.filter((d) => String(d.timestamp).startsWith('2026-11-05'))
    }

    const invalidInputs = [
      { capture, subscriberIds: [] },
      { capture, subscriberIds: ['   '] },
      { capture, subscriberIds: ['sub-alpha', ''] },
      { capture, subscriberIds: ['ops@example.com'] },
      { capture: { stationId: '9999999RF', data: capture.data }, subscriberIds: ['sub-alpha'] },
      { capture: { stationId: capture.stationId, data: capture.data.slice(0, 287) }, subscriberIds: ['sub-alpha'] },
      { capture: nov5Slice, subscriberIds: ['sub-alpha'] },
      {
        capture: {
          stationId: capture.stationId,
          data: capture.data.map((row, idx) => (idx === 10 ? { ...row, rf: Number.NaN } : row))
        },
        subscriberIds: ['sub-alpha']
      },
      {
        capture: {
          stationId: capture.stationId,
          data: capture.data.map((row, idx) => (idx === 10 ? { ...row, timestamp: '2026-11-02T99:99:00' } : row))
        },
        subscriberIds: ['sub-alpha']
      }
    ]

    for (const badInput of invalidInputs) {
      const failHarness = createReplayHarness()
      expect(() =>
        runSkyReplay(
          {
            capture: badInput.capture,
            subscriberIds: badInput.subscriberIds,
            recordedAt: RECORDED_AT,
            daylight: DAYLIGHT
          },
          failHarness.ports
        )
      ).toThrow()
      expect(failHarness.getCounts()).toEqual({
        replaceWindows: 0,
        replaceClauses: 0,
        nextSequence: 0,
        createCrossing: 0
      })
    }
  })

  test('5. allocates fresh crossing sequences on manual replay reruns without overwriting prior files', () => {
    const capture = loadNov2Capture()
    const sharedHarness = createReplayHarness()

    const firstRun = runSkyReplay(
      {
        capture,
        subscriberIds: ['sub-ops-01'],
        recordedAt: RECORDED_AT,
        daylight: DAYLIGHT
      },
      sharedHarness.ports
    )

    const firstFilenames = firstRun.files.map((file) => file.filename)
    expect(firstFilenames).toContain('crossing-20261102-1505-01.json')
    expect(firstFilenames).toContain('crossing-20261102-1520-01.json')

    const secondRun = runSkyReplay(
      {
        capture,
        subscriberIds: ['sub-ops-01'],
        recordedAt: '2026-11-07T09:20:00+08:00',
        daylight: DAYLIGHT
      },
      sharedHarness.ports
    )

    const secondFilenames = secondRun.files.map((file) => file.filename)
    expect(secondFilenames).toContain('crossing-20261102-1505-02.json')
    expect(secondFilenames).toContain('crossing-20261102-1520-02.json')

    const second1505 = secondRun.files.find((file) => file.filename === 'crossing-20261102-1505-02.json')
    expect(second1505?.document.crossing_id).toBe('X-20261102-1505-02')

    const allStoredFilenames = sharedHarness.getFiles().map((file) => file.filename)
    expect(new Set(allStoredFilenames).size).toBe(allStoredFilenames.length)
    expect(allStoredFilenames).toHaveLength(firstRun.files.length + secondRun.files.length)
  })

  test('6. selectReplaySubscriberIds resolves consenting active team subscribers to opaque IDs without leaking emails', () => {
    const subscribers: Row<'subscribers'>[] = [
      {
        subscriber_id: ' sub-team-lead ',
        email: 'lead.ops@example.com',
        role: 'approver',
        language: 'en',
        consent_at: '2026-10-01T08:00:00+08:00',
        unsubscribed_at: ''
      },
      {
        subscriber_id: 'sub-team-duty',
        email: 'DUTY.ENG@EXAMPLE.COM',
        role: 'operator',
        language: 'en',
        consent_at: '2026-10-02T08:00:00+08:00',
        unsubscribed_at: ''
      },
      {
        subscriber_id: 'sub-public-guest',
        email: 'guest@example.com',
        role: 'subscriber',
        language: 'en',
        consent_at: '2026-10-03T08:00:00+08:00',
        unsubscribed_at: ''
      }
    ]

    const selected = selectReplaySubscriberIds(
      ' Lead.Ops@example.com , duty.eng@example.com , lead.ops@example.com ',
      subscribers
    )
    expect(selected).toEqual(['sub-team-lead', 'sub-team-duty'])
    for (const id of selected) {
      expect(id).not.toContain('@')
    }

    const failureCases: Array<{ emails: string; rows: Row<'subscribers'>[] }> = [
      { emails: '   ', rows: subscribers },
      { emails: 'missing.person@example.com', rows: subscribers },
      {
        emails: 'no.consent@example.com',
        rows: [
          {
            subscriber_id: 'sub-no-consent',
            email: 'no.consent@example.com',
            consent_at: '',
            unsubscribed_at: ''
          }
        ]
      },
      {
        emails: 'unsub.user@example.com',
        rows: [
          {
            subscriber_id: 'sub-unsub',
            email: 'unsub.user@example.com',
            consent_at: '2026-10-20T08:00:00+08:00',
            unsubscribed_at: '2026-10-10T08:00:00+08:00'
          }
        ]
      },
      {
        emails: 'blank.id@example.com',
        rows: [
          {
            subscriber_id: '   ',
            email: 'blank.id@example.com',
            consent_at: '2026-10-01T08:00:00+08:00',
            unsubscribed_at: ''
          }
        ]
      }
    ]

    for (const failureCase of failureCases) {
      let caught: Error | null = null
      try {
        selectReplaySubscriberIds(failureCase.emails, failureCase.rows)
      } catch (error) {
        caught = error instanceof Error ? error : new Error(String(error))
      }
      expect(caught).not.toBeNull()
      expect(caught?.message).not.toContain('@')
      expect(caught?.message).not.toContain('example.com')
    }
  })

  test('7. offline generateReplayData writes deterministic 288-record TS module from verified fixture and rejects corrupt source', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'skyclause-replay-gen-'))
    try {
      const sourceBytesBefore = readFileSync(FIXTURE_PATH)
      expect(sha256(sourceBytesBefore.toString('utf8'))).toBe(KNOWN_FIXTURE_SHA256)

      const generatorMod = (await import('../generate-replay-data.ts')) as {
        generateReplayData: (options: { sourcePath: string; outputPath: string }) => Promise<void>
      }
      expect(typeof generatorMod.generateReplayData).toBe('function')

      const outputPath1 = join(tempDir, 'replay-data-1.ts')
      const outputPath2 = join(tempDir, 'replay-data-2.ts')

      await generatorMod.generateReplayData({
        sourcePath: FIXTURE_PATH,
        outputPath: outputPath1
      })
      await generatorMod.generateReplayData({
        sourcePath: FIXTURE_PATH,
        outputPath: outputPath2
      })

      const generatedText1 = readFileSync(outputPath1, 'utf8')
      const generatedText2 = readFileSync(outputPath2, 'utf8')
      expect(generatedText1).toBe(generatedText2)

      const generatedMod = (await import(pathToFileURL(outputPath1).href)) as {
        JPS_REPLAY_CAPTURE: SkyReplayCapture
        JPS_REPLAY_SOURCE: {
          fixture: string
          sha256: string
          replayDate: string
          stationId: string
        }
      }

      const expectedCapture = loadNov2Capture()
      expect(generatedMod.JPS_REPLAY_SOURCE).toEqual({
        fixture: 'pilot/fixtures/rainfall-graph-75-20261105T1312Z.json',
        sha256: KNOWN_FIXTURE_SHA256,
        replayDate: '2026-11-02',
        stationId: JPS_SOURCE_ID
      })
      expect(generatedMod.JPS_REPLAY_CAPTURE.stationId).toBe(JPS_SOURCE_ID)
      expect(generatedMod.JPS_REPLAY_CAPTURE.data).toHaveLength(288)
      expect(generatedMod.JPS_REPLAY_CAPTURE.data).toEqual(expectedCapture.data)

      const record1500 = generatedMod.JPS_REPLAY_CAPTURE.data.find((d) => d.timestamp === '2026-11-02T15:00:00')
      expect(record1500?.rf).toBe(9.5)
      const totalRf = generatedMod.JPS_REPLAY_CAPTURE.data.reduce((sum, item) => sum + item.rf, 0)
      expect(totalRf).toBeCloseTo(65.0, 5)

      const corruptSourcePath = join(tempDir, 'corrupt-fixture.json')
      const corruptOutputPath = join(tempDir, 'corrupt-output.ts')
      writeFileSync(corruptSourcePath, '{"stationId":"0232901RF","data":"corrupt"}', 'utf8')

      await expect(
        generatorMod.generateReplayData({
          sourcePath: corruptSourcePath,
          outputPath: corruptOutputPath
        })
      ).rejects.toThrow()
      expect(existsSync(corruptOutputPath)).toBe(false)

      const sourceBytesAfter = readFileSync(FIXTURE_PATH)
      expect(sourceBytesAfter.equals(sourceBytesBefore)).toBe(true)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})

test('replay retains recovery checkpoints across repeated ticks before the next new APIMS observation', () => {
  const apims = buildHourlyApimsReadings(52).filter(
    (row) => row.observed_at === '2026-11-02T00:00:00+08:00' || String(row.observed_at) >= '2026-11-02T03:00:00+08:00'
  )
  for (const stamp of ['2026-11-02T02:30:00+08:00', '2026-11-02T02:45:00+08:00']) {
    for (const stationId of BOUND_APIMS_STATION_IDS)
      apims.push({
        reading_id: `${stationId}:api:${stamp}`,
        source_kind: 'apims',
        source_id: stationId,
        metric: 'api',
        observed_at: stamp,
        received_at: stamp,
        value: 52,
        unit: 'API',
        revision: 1,
        poll_id: `test-apims-${stamp}`
      })
  }
  const harness = createReplayHarness()
  const result = runSkyReplay(
    {
      capture: loadNov2Capture(),
      subscriberIds: ['sub-ops-01'],
      recordedAt: RECORDED_AT,
      daylight: DAYLIGHT,
      apimsReadings: apims
    },
    harness.ports
  )
  expect(result.notice).toBeNull()
  const recovery = result.files.find((file) => file.document.t_eval === '2026-11-02T02:45:00+08:00')
  expect(recovery?.document.changes.find((change) => change.scope === 'site')?.to).toBe('normal')
  const rain = result.files.find((file) => file.document.t_eval === '2026-11-02T15:05:00+08:00')
  expect(rain?.document.changes.some((change) => change.to === 'commute_disruption')).toBe(true)
})
