import { randomUUID } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { CAMERA_INDICATORS, check, evaluate, resolveSourceAt, snapshotAt, type SheetInput } from '@skyclause/clauses'
import {
  domainEvent,
  loadEvaluatorHistory,
  poll,
  reading,
  source,
  systemPrincipal,
  upsertSourceCatalogue,
  withSystem,
  withTenant
} from '@skyclause/db'
import { indicators } from '@skyclause/sources/indicators'
import { makeOrganization, makeProject, makeProjectSource, makeSource } from '../../../packages/db/test/factories'
import { memberOf } from '../../../packages/db/test/harness'
import { sourceSnapshot, readSourcePlan } from '../src/sources/plan'
import { ingestSourceResult, sourceIngestionDatabase } from '../src/sources/ingest'
import { publishSourceResult, type ResultReference } from '../src/sources/pubsub'
import type { SourceExecutionResult } from '../src/sources/types'
import { readFileSync } from 'node:fs'
import { expect, test, vi } from 'vitest'
import { adapters, HttpError, NetworkError, RateLimitedError, SchemaError } from '@skyclause/sources'
import { createMetForecastAdapter } from '../../../packages/sources/src/adapters/met-forecast'
import { metWarning } from '../../../packages/sources/src/adapters/met-warning'
import { forecastSource, warningSource } from '../../../packages/sources/test/met-support'
import { createPollContext } from '../src/sources/http'
import { configureMetDiscovery } from '../src/sources/met'
import { createSourceJobs } from '../src/sources/jobs'
import { decodeObject, encodeObject } from '../src/sources/storage'
import { MemoryStore, TestClock, flush } from './support/source-adapter'

const catalogue = readFileSync(
  new URL('../../../packages/sources/test/fixtures/weather-forecast-all-20261111T140148Z.json', import.meta.url)
)
const ports = () => {
  const store = new MemoryStore(),
    clock = new TestClock()
  let sequence = 0
  return {
    store,
    scratch: store,
    clock,
    id: () => `met-${++sequence}`,
    userAgent: 'Skyclause/test',
    log: vi.fn(),
    http: vi.fn(async () => new Response(catalogue, { headers: { 'content-type': 'application/json' } }))
  }
}

test('discovery_shares_weather_budget_with_both_adapters_and_probes', async () => {
  const p = ports()
  const make = (sources = [forecastSource]) =>
    createPollContext({
      kind: sources[0]?.kind ?? 'met_forecast',
      family: 'datagovmy-weather',
      sources,
      storage: { get: async () => null, put: async () => {} },
      budget: p.store,
      http: p.http,
      userAgent: p.userAgent,
      periods: async () => [],
      log: p.log,
      clock: p.clock,
      requestId: p.id
    })
  const warning = make([warningSource])
  await metWarning.fetch([warningSource], warning.ctx)
  const forecast = make()
  await createMetForecastAdapter().fetch([forecastSource], forecast.ctx)
  const configured = configureMetDiscovery(adapters, p)
  const discovery = configured.find((adapter) => adapter.kind === 'met_forecast')!
  await discovery.discover!()
  const sid = '00000000-0000-7000-8000-000000000001'
  await p.store.write(
    'control/plan.json',
    encodeObject({
      version: 1,
      generatedAt: p.clock.now().toISOString(),
      periods: [],
      sources: [
        {
          source: { ...forecastSource, id: sid },
          bindings: [{ orgId: sid, projectId: sid }],
          previousPollDigest: null,
          previousBackfillDigest: null
        }
      ]
    }),
    '0'
  )
  const publish = vi.fn()
  const database = {
    snapshot: vi.fn(async () => {
      throw new Error('database forbidden')
    }),
    catalogue: vi.fn(async () => {
      throw new Error('database forbidden')
    })
  }
  const jobs = createSourceJobs({ ...p, adapters: [discovery], database, publish })
  await jobs.adapterContracts()
  expect(p.log).toHaveBeenCalledWith('source.contract.passed', { adapter: 'met_forecast' })
  expect(publish).not.toHaveBeenCalled()
  expect(database.snapshot).not.toHaveBeenCalled()
  expect(database.catalogue).not.toHaveBeenCalled()
  const claims = () =>
    decodeObject<{ requests: { requestId: string; startedAt: number }[] }>(
      p.store.objects.get('control/budgets/datagovmy-weather.json')!.body
    ).requests
  expect(claims()).toHaveLength(4)
  expect(new Set(claims().map((claim) => claim.requestId)).size).toBe(4)
  expect(claims().every((claim) => claim.startedAt === p.clock.now().getTime())).toBe(true)
  const restarted = configureMetDiscovery(adapters, p).find((adapter) => adapter.kind === 'met_forecast')!
  const denied = expect(restarted.discover!()).rejects.toBeInstanceOf(RateLimitedError)
  await flush()
  await p.clock.advance(19999)
  expect(p.http).toHaveBeenCalledTimes(4)
  await p.clock.advance(1)
  await denied
  expect(p.log).toHaveBeenCalledWith(
    'source.discovery.request',
    expect.objectContaining({
      sourceIds: [],
      httpStatus: null,
      admissionMs: 20000,
      error: { type: 'rate_limited', message: expect.any(String) }
    })
  )
  await p.clock.advance(40000)
  const stillHeld = make([])
  const held = expect(stillHeld.ctx.http('https://api.data.gov.my/weather/forecast/')).rejects.toBeInstanceOf(
    RateLimitedError
  )
  await flush()
  await p.clock.advance(20000)
  await held
  expect(p.http).toHaveBeenCalledTimes(4)
  const next = make([])
  await next.ctx.http('https://api.data.gov.my/weather/forecast/')
  expect(p.http).toHaveBeenCalledTimes(5)
  expect(claims()).toHaveLength(1)
  for (const context of [warning, forecast, stillHeld, next]) await context.closeAndDrain()
})

test.each([301, 429, 500, null])('discovery retains actual %s status with no retries', async (status) => {
  const p = ports()
  p.http = vi.fn(async () => {
    if (status === null) throw new Error('transport down')
    return new Response('provider failure', { status })
  })
  const configured = configureMetDiscovery(adapters, p)
  await expect(configured.find((adapter) => adapter.kind === 'met_forecast')!.discover!()).rejects.toBeInstanceOf(
    status === null ? NetworkError : HttpError
  )
  expect(p.http).toHaveBeenCalledTimes(1)
  expect(p.clock.sleepers).toHaveLength(0)
  expect(p.log).toHaveBeenCalledWith(
    'source.discovery.request',
    expect.objectContaining({ adapter: 'met_forecast', sourceIds: [], httpStatus: status, error: expect.any(Object) })
  )
})

test('configured discovery drains and logs captures before catalogue writes; failure preserves catalogue', async () => {
  const p = ports()
  const configured = configureMetDiscovery(adapters, p)
  for (const adapter of adapters)
    if (adapter.kind !== 'met_forecast')
      expect(configured.find((candidate) => candidate.kind === adapter.kind)).toBe(adapter)
  const forecast = configured.find((adapter) => adapter.kind === 'met_forecast')!
  expect(forecast).not.toBe(adapters.find((adapter) => adapter.kind === 'met_forecast'))
  const database = {
    snapshot: vi.fn(async () => {
      throw new Error('unexpected snapshot')
    }),
    catalogue: vi.fn(async () => {
      expect(p.log).toHaveBeenCalledWith(
        'source.discovery.request',
        expect.objectContaining({
          adapter: 'met_forecast',
          sourceIds: [],
          httpStatus: 200,
          bodySha256: '4cfd224c629aaf6f4655d613b8624f5543251659da8c414146b492b2dfeec5f1',
          bodyBytes: catalogue.byteLength
        })
      )
      expect(p.clock.sleepers).toHaveLength(0)
    })
  }
  const publish = vi.fn()
  const jobs = createSourceJobs({ ...p, adapters: [forecast], database, publish })
  await jobs.catalogueSync()
  expect(database.catalogue).toHaveBeenCalledExactlyOnceWith(
    forecast,
    expect.arrayContaining([expect.objectContaining({ externalId: 'Ds058' })])
  )
  expect(database.snapshot).not.toHaveBeenCalled()
  expect(publish).not.toHaveBeenCalled()
  p.http.mockImplementation(async () => new Response('{}', { headers: { 'content-type': 'application/json' } }))
  await expect(jobs.catalogueSync()).rejects.toBeInstanceOf(SchemaError)
  expect(database.catalogue).toHaveBeenCalledTimes(1)
  expect(p.log).toHaveBeenCalledWith(
    'source.discovery.failed',
    expect.objectContaining({ adapter: 'met_forecast', error: expect.any(String) })
  )
  const source = readFileSync(new URL('../src/sources/index.ts', import.meta.url), 'utf8')
  expect(source).toContain('configureMetDiscovery(adapters,')
  expect(source).toContain('adapters: configuredAdapters')
  expect(source).toContain('sourceIngestionDatabase(configuredAdapters)')
})

type MetRawRow = {
  warning_issue?: { title_en: string; issued: string }
  valid_from?: string | null
  text_en?: string
  text_bm?: string
  instruction_bm?: string | null
  location?: { location_id: string; location_name: string }
  date?: string
  afternoon_forecast?: string
  max_temp?: number
  [key: string]: unknown
}
const rawRows = (body: string): MetRawRow[] => JSON.parse(body)

const warningBody = readFileSync(
  new URL('../../../packages/sources/test/fixtures/weather-warning-20261105T1313Z.json', import.meta.url),
  'utf8'
)
const forecastBody = readFileSync(
  new URL('../../../packages/sources/test/fixtures/weather-forecast-kl-20261108T014413Z.json', import.meta.url),
  'utf8'
)
const defaultSky = JSON.parse(
  readFileSync(new URL('../../../packages/clauses/defaults/sky.json', import.meta.url), 'utf8')
) as SheetInput
const metPrincipal = systemPrincipal('test:met')
async function metFixture(kind: 'met_warning' | 'met_forecast' = 'met_warning') {
  const identities = kind === 'met_warning' ? ['met-warnings'] : ['Ds058', 'St009']
  const sources = await withSystem(metPrincipal.job, async (tx) => {
    // Append-only test history retains its IDs; release catalogue external IDs between isolated cases.
    for (const externalId of identities)
      await tx
        .update(source)
        .set({ externalId: randomUUID() })
        .where(and(eq(source.kind, kind), eq(source.externalId, externalId)))
    return Promise.all(
      identities.map((externalId) =>
        makeSource(tx, {
          kind,
          externalId,
          name: externalId === 'St009' ? 'WP Kuala Lumpur' : 'Kuala Lumpur',
          ownerOrgId: null,
          url: `https://api.data.gov.my/weather/${kind === 'met_warning' ? 'warning' : 'forecast'}/`,
          cadenceS: kind === 'met_warning' ? 600 : 21600,
          staleAfterS: kind === 'met_warning' ? 1200 : 43200,
          freshness: 'polled',
          meta: {},
          licenceId: 'CC-BY-4.0',
          licenceLabel: 'MET Malaysia via data.gov.my, CC BY 4.0'
        })
      )
    )
  })
  const projects: Array<{ project: Awaited<ReturnType<typeof makeProject>>; orgId: string }> = []
  for (let i = 0; i < 2; i++) {
    const orgId = (await makeOrganization()).id
    const project = await withTenant({ orgId, principal: metPrincipal }, async (tx) => {
      const p = await makeProject(tx, { warningAreaTerms: i === 0 ? ['Kedah'] : ['Kuala Lumpur'] })
      for (const source of sources)
        await makeProjectSource(tx, {
          projectId: p.id,
          sourceId: source.id,
          role: kind === 'met_warning' ? 'warnings' : 'met_forecast'
        })
      return p
    })
    projects.push({ project, orgId })
  }
  const store = new MemoryStore(),
    clock = new TestClock()
  clock.time = Date.parse(kind === 'met_warning' ? '2026-11-05T13:13:00Z' : '2026-11-08T01:44:13Z')
  let body = kind === 'met_warning' ? warningBody : forecastBody,
    status = 200,
    failure = false,
    malformedSource: string | null = null,
    malformedBody = '{}'
  const http = vi.fn(async (url: Parameters<typeof fetch>[0], options?: Parameters<typeof fetch>[1]) => {
    expect(options?.redirect).toBe('manual')
    await clock.advance(37)
    if (failure) {
      await clock.advance(20000)
      throw new DOMException('timed out', 'TimeoutError')
    }
    const selectedBody =
      malformedSource && new URL(String(url)).searchParams.get('contains')?.startsWith(malformedSource)
        ? malformedBody
        : body
    return new Response(selectedBody, {
      status,
      headers: { 'content-type': status === 301 ? 'text/html' : 'application/json' }
    })
  })
  const results: SourceExecutionResult[] = [],
    refs: ResultReference[] = [],
    published: unknown[] = []
  const database = {
    snapshot: vi.fn(async () => {
      throw new Error('capture must not query DB')
    }),
    catalogue: vi.fn(async () => {
      throw new Error('capture must not query DB')
    })
  }
  const jobPorts = {
    store,
    scratch: store,
    clock,
    id: randomUUID,
    adapters: adapters.filter((a) => a.kind === kind),
    http,
    userAgent: 'Skyclause/test',
    database,
    log: () => {},
    publish: async (result: SourceExecutionResult) => {
      results.push(result)
      await publishSourceResult(result, {
        store,
        publish: async (ref) => {
          refs.push(ref)
        }
      })
    }
  }
  const jobs = createSourceJobs(jobPorts)
  const snapshot = await sourceSnapshot(clock.now())
  await store.write(
    'control/plan.json',
    encodeObject({
      ...snapshot,
      sources: snapshot.sources.filter((s) => sources.some((source) => source.id === s.source.id))
    }),
    '0'
  )
  const plan = await readSourcePlan(store)
  const rows = () =>
    withSystem(metPrincipal.job, async (tx) => ({
      readings: await tx
        .select()
        .from(reading)
        .where(
          inArray(
            reading.sourceId,
            sources.map((s) => s.id)
          )
        )
        .orderBy(reading.sourceId, reading.observedAt, reading.itemKey, reading.revision),
      polls: await tx
        .select()
        .from(poll)
        .where(
          inArray(
            poll.sourceId,
            sources.map((s) => s.id)
          )
        )
        .orderBy(poll.startedAt, poll.sourceId),
      events: await tx
        .select()
        .from(domainEvent)
        .where(
          and(
            eq(domainEvent.type, 'poll.recorded'),
            inArray(
              domainEvent.projectId,
              projects.map((p) => p.project.id)
            )
          )
        )
    }))
  const ingest = async (ref = refs.at(-1)!) => {
    await clock.advance(11)
    await ingestSourceResult(ref, {
      store,
      ...sourceIngestionDatabase(adapters, clock.now),
      publish: async (event) => {
        published.push(event)
      }
    })
  }
  const capture = async () => {
    const scheduled = clock.now().toISOString()
    await jobs.runAdapter(kind, scheduled)
    return refs.at(-1)!
  }
  const history = (index: number, at = clock.now().toISOString()) => {
    const p = projects[index]!
    return withTenant({ orgId: p.orgId, principal: memberOf(p.orgId) }, (tx) =>
      loadEvaluatorHistory(tx, { projectId: p.project.id, pack: 'sky', tEval: at })
    )
  }
  return {
    sources,
    projects,
    store,
    clock,
    http,
    results,
    refs,
    jobs,
    plan,
    database,
    rows,
    ingest,
    capture,
    history,
    published,
    jobPorts,
    setBody: (v: string) => {
      body = v
    },
    setStatus: (v: number) => {
      status = v
    },
    setFailure: (v: boolean) => {
      failure = v
    },
    setMalformedSource: (v: string, replacement = '{}') => {
      malformedSource = v
      malformedBody = replacement
    }
  }
}

test('actual source and camera metadata check the unchanged full default Sky sheet', () => {
  const storm = { ...defaultSky, clauses: defaultSky.clauses.filter((c) => c.key === 'storm_watch') }
  expect(check(storm, indicators).ok).toBe(true)
  const full = check(defaultSky, [...indicators, ...CAMERA_INDICATORS])
  expect(full.issues.filter((d) => d.message.includes('met_'))).toEqual([])
  expect(full.publishable, JSON.stringify(full.issues)).toBe(true)
  expect(full.ok).toBe(true)
})

test.each(['met_warning', 'met_forecast'] as const)(
  'met_capture_ingest_preserves_text_and_source_fanout: %s',
  async (kind) => {
    const t = await metFixture(kind)
    expect(t.plan.sources.every((s) => s.bindings.length === 2)).toBe(true)
    await t.capture()
    expect(await t.rows()).toEqual({ readings: [], polls: [], events: [] })
    expect(t.database.snapshot).not.toHaveBeenCalled()
    expect(t.database.catalogue).not.toHaveBeenCalled()
    expect(t.http).toHaveBeenCalledTimes(kind === 'met_warning' ? 1 : 2)
    expect(new Set(t.results[0]!.requests.map((request) => request.url)).size).toBe(t.sources.length)
    for (const request of t.results[0]!.requests) {
      expect(Buffer.from(request.body!)).toEqual(Buffer.from(kind === 'met_warning' ? warningBody : forecastBody))
      expect(request).toMatchObject({ httpStatus: 200, latencyMs: 37 })
    }
    const ref = t.refs[0]!,
      immutable = await t.store.read(ref.object_path)
    await t.ingest()
    await t.ingest(ref)
    expect(await t.store.read(ref.object_path)).toEqual(immutable)
    const rows = await t.rows(),
      count = kind === 'met_warning' ? 4 : 14
    expect(rows.readings).toHaveLength(count)
    expect(rows.polls).toHaveLength(t.sources.length)
    expect(rows.events).toHaveLength(t.sources.length * 2)
    for (const source of t.sources) {
      const own = rows.readings.filter((r) => r.sourceId === source.id)
      const raw = rawRows(kind === 'met_warning' ? warningBody : forecastBody).filter(
        (r) => kind === 'met_warning' || r.location?.location_id === source.externalId
      )
      expect(own).toHaveLength(raw.length)
      for (const row of own) {
        const original = raw.find((r) =>
          kind === 'met_warning'
            ? `${r.warning_issue!.title_en}|${r.valid_from}` === row.itemKey
            : r.date === row.itemKey
        )
        expect(row.valueJson).toMatchObject(original!)
        for (const [key, value] of Object.entries(original!))
          expect((row.valueJson as Record<string, unknown>)[key]).toEqual(value)
        expect(row.valueText).toBe(kind === 'met_warning' ? original!.text_en : original!.afternoon_forecast)
        expect(row.observedAt.toISOString()).toBe(
          new Date(
            kind === 'met_warning' ? `${original!.warning_issue!.issued}+08:00` : `${original!.date}T00:00:00+08:00`
          ).toISOString()
        )
        expect(Buffer.from(row.valueText!)).toEqual(
          Buffer.from(String(kind === 'met_warning' ? original!.text_en : original!.afternoon_forecast))
        )
        expect(row.receivedAt.getTime()).toBeGreaterThan(
          rows.polls.find((p) => p.id === row.pollId)!.startedAt.getTime()
        )
      }
      const sourcePoll = rows.polls.find((p) => p.sourceId === source.id)!
      expect(
        rows.events
          .filter((e) => (e.data as Record<string, unknown>).source_id === source.id)
          .map((e) => e.projectId)
          .sort()
      ).toEqual(t.projects.map((p) => p.project.id).sort())
      expect(sourcePoll).toMatchObject({ purpose: 'poll', outcome: 'ok', httpStatus: 200, latencyMs: 37 })
      for (const event of rows.events.filter((e) => (e.data as Record<string, unknown>).source_id === source.id))
        expect(event.data).toMatchObject({ source_id: source.id, poll_id: sourcePoll.id, new_rows: raw.length })
    }
    if (kind === 'met_warning') {
      const checked = check(
        { ...defaultSky, clauses: defaultSky.clauses.filter((c) => c.key === 'storm_watch') },
        indicators
      ).sheet!
      const at = t.clock.now().toISOString(),
        window = { id: 'current', startsAt: at, endsAt: at, kind: 'class' as const, tz: 'Asia/Kuala_Lumpur' }
      const kedah = snapshotAt(await t.history(0), indicators, t.projects[0]!.project.id, 'sky', at)
      const kl = snapshotAt(await t.history(1), indicators, t.projects[1]!.project.id, 'sky', at)
      expect(evaluate(checked, kedah, [window], at).windows[0]!.watch).toBe(true)
      expect(evaluate(checked, kl, [window], at).windows[0]!.watch).toBe(false)
      expect(
        rows.readings.find((r) => (r.valueJson as Record<string, unknown> | null)?.excluded === false)!.valueJson
      ).toMatchObject({
        instruction_en: null,
        instruction_bm: null
      })
    } else {
      const at = t.clock.now().toISOString()
      const snapshot = snapshotAt(await t.history(0), indicators, t.projects[0]!.project.id, 'sky', at)
      expect(snapshot.site['site.met_afternoon_thunderstorm']?.value).toBe(true)
    }
  }
)

test.each(['met_warning', 'met_forecast'] as const)(
  'met_unchanged_and_revision_clocks_are_append_only: %s',
  async (kind) => {
    const t = await metFixture(kind),
      cadence = kind === 'met_warning' ? 600000 : 21600000
    await t.capture()
    await t.ingest()
    const first = await t.rows()
    if (kind === 'met_forecast') t.setBody(JSON.stringify(rawRows(forecastBody).reverse()))
    await t.clock.advance(cadence)
    const late = await t.capture()
    const changed = rawRows(kind === 'met_warning' ? warningBody : forecastBody)
    const target = kind === 'met_warning' ? changed[2]! : changed.find((r) => r.location?.location_id === 'Ds058')!
    if (kind === 'met_warning') target.instruction_bm = 'Test correction: ' + target.text_bm
    else target.max_temp = Number(target.max_temp) + 1
    t.setBody(JSON.stringify(changed.reverse()))
    await t.clock.advance(cadence)
    await t.capture()
    await t.ingest()
    const revised = await t.rows()
    expect(revised.readings).toHaveLength(first.readings.length + 1)
    expect(revised.readings.filter((r) => r.revision === 2)).toHaveLength(1)
    await t.clock.advance(cadence)
    await t.capture()
    await t.ingest()
    const newerUnchanged = await t.rows()
    expect(newerUnchanged.polls.slice(-t.sources.length).every((p) => p.outcome === 'unchanged')).toBe(true)
    await t.ingest(late)
    const final = await t.rows()
    expect(final.readings).toEqual(revised.readings)
    expect(final.readings.filter((r) => r.revision === 1)).toEqual(first.readings)
    expect(final.polls).toHaveLength(t.sources.length * 4)
    expect(final.events.filter((e) => (e.data as Record<string, unknown>).new_rows === 0)).toHaveLength(
      t.sources.length * 2 * 2 + (kind === 'met_forecast' ? 2 : 0)
    )
    expect(t.http).toHaveBeenCalledTimes(t.sources.length * 4)
    expect(t.results.every((r) => r.purpose === 'poll' && r.scheduledAt !== null)).toBe(true)
  }
)

test.each(['met_warning', 'met_forecast'] as const)('met_source_errors_never_fall_back: %s', async (kind) => {
  const t = await metFixture(kind),
    cadence = kind === 'met_warning' ? 600000 : 21600000
  await t.capture()
  await t.ingest()
  const before = await t.rows()
  for (const failure of [429, 500, 301, 'timeout', 'json', 'field'] as const) {
    t.setFailure(failure === 'timeout')
    t.setStatus(typeof failure === 'number' ? failure : 200)
    const raw = rawRows(kind === 'met_warning' ? warningBody : forecastBody)
    if (failure === 'field')
      for (const row of raw) {
        if (kind === 'met_warning') delete row.text_bm
        else delete row.afternoon_forecast
      }
    t.setBody(failure === 'json' ? '{' : failure === 301 ? '<html>Moved</html>' : JSON.stringify(raw))
    await t.clock.advance(cadence)
    const calls = t.http.mock.calls.length
    await t.capture()
    expect(t.http).toHaveBeenCalledTimes(calls + t.sources.length)
    await t.ingest()
    const rows = await t.rows()
    expect(rows.readings).toEqual(before.readings)
    for (const p of rows.polls.slice(-t.sources.length))
      expect(p).toMatchObject({
        outcome: 'error',
        httpStatus: failure === 'timeout' ? null : typeof failure === 'number' ? failure : 200,
        latencyMs: failure === 'timeout' ? 20037 : 37,
        purpose: 'poll'
      })
    expect(t.results.at(-1)!.polls.every((p) => p.outcome === 'error' && p.readings.length === 0)).toBe(true)
  }
  expect((await t.rows()).polls).toHaveLength(t.sources.length * 7)
  t.setFailure(false)
  t.setStatus(200)
  t.setBody(kind === 'met_warning' ? warningBody : forecastBody)
  await t.clock.advance(cadence)
  await t.capture()
  await t.ingest()
  expect((await t.rows()).polls.slice(-t.sources.length).every((p) => p.outcome === 'unchanged')).toBe(true)
})

test.each(['malformed', 'missing'] as const)(
  '%s forecast fails only its bound source while sibling stores its own rows',
  async (failure) => {
    const t = await metFixture('met_forecast')
    t.setMalformedSource(
      'WP Kuala Lumpur',
      failure === 'malformed'
        ? '{}'
        : JSON.stringify(rawRows(forecastBody).filter((row) => row.location?.location_id !== 'St009'))
    )
    await t.capture()
    await t.ingest()
    const rows = await t.rows()
    expect(rows.readings).toHaveLength(7)
    expect(
      rows.readings.every(
        (r) =>
          r.sourceId === t.sources[0]!.id &&
          (r.valueJson as Record<string, unknown> | null)?.location &&
          ((r.valueJson as Record<string, unknown>).location as Record<string, unknown>).location_id === 'Ds058'
      )
    ).toBe(true)
    expect(rows.polls.find((p) => p.sourceId === t.sources[1]!.id)).toMatchObject({ outcome: 'error', httpStatus: 200 })
  }
)

test('empty_warning_feed_is_success_without_synthetic_warning', async () => {
  const t = await metFixture()
  await t.capture()
  await t.ingest()
  const before = await t.rows()
  t.setBody('[]')
  await t.clock.advance(600000)
  await t.capture()
  await t.ingest()
  const empty = await t.rows()
  expect(empty.readings).toEqual(before.readings)
  expect(empty.polls.at(-1)).toMatchObject({ outcome: 'unchanged', httpStatus: 200 })
  const history = await t.history(0),
    at = t.clock.now().toISOString()
  expect(resolveSourceAt(history, t.sources[0]!.id, at).state).toBe('fresh')
  expect(
    snapshotAt(history, indicators, t.projects[0]!.project.id, 'sky', at).site['site.met_warning_in_force']?.value
  ).toBe(true)
  await t.clock.advance(4 * 3600000)
  await t.capture()
  await t.ingest()
  // A long successful poll gap is recovered first; the following normal slot is fresh.
  await t.clock.advance(600000)
  await t.capture()
  await t.ingest()
  const expiredAt = t.clock.now().toISOString()
  expect(
    snapshotAt(await t.history(0), indicators, t.projects[0]!.project.id, 'sky', expiredAt).site[
      'site.met_warning_in_force'
    ]?.value
  ).toBe(false)
  t.setBody('{"error":"upstream unavailable"}')
  await t.clock.advance(600000)
  await t.capture()
  await t.ingest()
  const error = await t.rows()
  expect(error.readings).toEqual(before.readings)
  expect(error.polls.at(-1)).toMatchObject({ outcome: 'error', errorCode: 'schema' })
})

test('catalogue and probe schema failures leave PostgreSQL catalogue/history unchanged', async () => {
  const t = await metFixture('met_forecast')
  await t.capture()
  await t.ingest()
  const before = await t.rows()
  const catalogueBefore = await withSystem(metPrincipal.job, (tx) =>
    tx
      .select()
      .from(source)
      .where(
        inArray(
          source.id,
          t.sources.map((s) => s.id)
        )
      )
  )
  t.setBody('{}')
  const configured = configureMetDiscovery(t.jobPorts.adapters, t.jobPorts)
  const jobs = createSourceJobs({
    ...t.jobPorts,
    adapters: configured,
    database: {
      snapshot: sourceSnapshot,
      catalogue: async (adapter, entries) => {
        await withSystem(metPrincipal.job, (tx) => upsertSourceCatalogue(tx, adapter, entries))
      }
    }
  })
  await expect(jobs.catalogueSync()).rejects.toThrow()
  await expect(jobs.adapterContracts()).rejects.toThrow()
  expect(await t.rows()).toEqual(before)
  expect(
    await withSystem(metPrincipal.job, (tx) =>
      tx
        .select()
        .from(source)
        .where(
          inArray(
            source.id,
            t.sources.map((s) => s.id)
          )
        )
    )
  ).toEqual(catalogueBefore)
})
