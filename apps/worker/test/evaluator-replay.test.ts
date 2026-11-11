import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import { eq, asc } from 'drizzle-orm'
import { canonicalHash, type SheetInput, type Verdict } from '@skyclause/clauses'
import { createEvaluatorProviders } from '@skyclause/api/evaluator'
import {
  withTenant,
  withSystem,
  systemPrincipal,
  createProjectRecord,
  clauseSheet,
  shadowState,
  crossing,
  domainEvent,
  loadEvaluatorDeadline,
  type Tx
} from '@skyclause/db'
import type { Source, SourceAdapter } from '@skyclause/sources'
import { parseJpsRainfall } from '../../../packages/sources/src/adapters/jps-parser'
import {
  makeOrganization,
  makeSource,
  makeReading,
  makePoll,
  makeProjectSource,
  makeWindow,
  makeSheetVersion
} from '../../../packages/db/test/factories'
import { TEST_REGISTRY } from '../../../packages/clauses/test/test-helpers'
import { evaluateProject } from '../src/evaluator/evaluate'
import { createEvaluatorPart } from '../src/evaluator'

const myt = (time: string) => new Date(`2026-11-02T${time}:00+08:00`)
async function scene(keys?: string[]) {
  const orgId = (await makeOrganization()).id
  const run = <T>(fn: (tx: Tx) => Promise<T>) =>
    withTenant({ orgId, principal: systemPrincipal('labelled-evaluator-replay') }, fn)
  const created = await run((tx) =>
    createProjectRecord(tx, {
      name: 'Labelled replay',
      slug: 'labelled-replay',
      siteName: 'APU',
      siteLat: 3,
      siteLon: 101,
      packs: ['sky']
    })
  )
  if (keys)
    await run(async (tx) => {
      const first = created.versions.find((v) => (v.content as SheetInput).pack === 'sky')!
      const content = {
        ...(first.content as SheetInput),
        clauses: (first.content as SheetInput).clauses.map((c) => ({ ...c, enabled: keys.includes(c.key) }))
      }
      const version = await makeSheetVersion(tx, {
        sheetId: first.sheetId,
        n: 2,
        status: 'published',
        content,
        contentHash: canonicalHash(content)
      })
      await tx.update(clauseSheet).set({ liveVersionId: version.id }).where(eq(clauseSheet.id, first.sheetId))
    })
  const providers = createEvaluatorProviders({
    adapters: [{ indicators: TEST_REGISTRY } as SourceAdapter<unknown>],
    forecast: null
  })
  return { orgId, run, created, providers, projectId: created.project.id }
}
test('stored APIMS capture yields CA16W67 with zero windows; missing mornings and an error remain named No call', async () => {
  const s = await scene()
  const capture = JSON.parse(
    readFileSync(new URL('../../../docs/sources/eqms.doe.gov.my/mapcaqm-20261105T1313Z.json', import.meta.url), 'utf8')
  ) as { data: Array<{ STATION_ID: string; API: number; RECORD_DT: string }> }
  const at = '2026-11-05T13:13:00Z'
  const sources: Awaited<ReturnType<typeof makeSource>>[] = []
  for (const id of ['CA16W', 'CA19B', 'CA17W']) {
    const row = capture.data.find((r) => r.STATION_ID === id)!
    const source = await withSystem('labelled-apims', async (tx) => {
      const source = await makeSource(tx, {
        kind: 'apims',
        externalId: id,
        freshness: 'polled',
        cadenceS: 900,
        staleAfterS: 7200
      })
      const poll = await makePoll(tx, { sourceId: source.id, startedAt: new Date(at), receivedAt: new Date(at) })
      await makeReading(tx, {
        sourceId: source.id,
        pollId: poll.id,
        metric: 'api',
        unit: 'API',
        value: row.API,
        observedAt: new Date(row.RECORD_DT + '+08:00'),
        receivedAt: new Date(at)
      })
      return source
    })
    sources.push(source)
    await s.run((tx) =>
      makeProjectSource(tx, {
        projectId: s.projectId,
        sourceId: source.id,
        role: 'api_station',
        createdAt: new Date(at)
      })
    )
  }
  const q = { projectId: s.projectId, tEval: at }
  await s.run((tx) => evaluateProject(tx, q, s.providers))
  const snapshot = await s.run((tx) =>
    s.providers.snapshots.take(tx, { ...q, pack: 'sky', windows: [], persist: true })
  )
  expect(snapshot.snapshot.site['site.api_max']).toMatchObject({ value: 67, sourceIds: [sources[0]!.id] })
  expect(snapshot.snapshot.site['site.api_0600_min_last3_max']?.value).toBeNull()
  let rows = await s.run((tx) => tx.select().from(shadowState))
  let verdict = rows[0]!.verdict as Verdict
  expect(verdict.clauses.find((c) => c.key === 'haze_watch')?.result).toBe('not_fired')
  expect(verdict.clauses.find((c) => c.key === 'haze_severe')?.result).toBe('blocked')
  const errorAt = '2026-11-05T13:14:00Z'
  const window = await s.run((tx) =>
    makeWindow(tx, {
      projectId: s.projectId,
      startsAt: new Date('2026-11-05T13:00:00Z'),
      endsAt: new Date('2026-11-05T14:00:00Z')
    })
  )
  for (const source of sources)
    await withSystem('labelled-apims-error', (tx) =>
      makePoll(tx, {
        sourceId: source.id,
        startedAt: new Date(errorAt),
        receivedAt: new Date(errorAt),
        outcome: 'error',
        httpStatus: 503
      })
    )
  await s.run((tx) => evaluateProject(tx, { ...q, tEval: errorAt }, s.providers))
  rows = await s.run((tx) => tx.select().from(shadowState))
  verdict = rows.find((r) => r.scopeId === window.id)!.verdict as Verdict
  for (const key of ['haze_watch', 'haze_severe']) {
    const scoped = rows.find((r) => r.scopeKind === 'site')!.verdict as Verdict
    const clause = scoped.clauses.find((c) => c.key === key)!
    expect(clause.result).toBe('blocked')
    expect(
      clause.blockedBy.some((input) => sources.some((s) => s.id === input.sourceId) && input.state === 'error')
    ).toBe(true)
  }
})
test('labelled Nov2 JPS batch and every derived deadline preserve the real crossing trace', async () => {
  const s = await scene(['storm_confirmed', 'flash_flood_risk', 'silent_input'])
  const bytes = readFileSync(
    new URL('../../../packages/clauses/test/fixtures/rainfall-graph-75-20261105T1312Z.json', import.meta.url)
  )
  expect(bytes.length).toBe(127043)
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    '25cae3be496cff29b9925595d23fc63b7ddf9c1a4fb29e22b806b00d4ed3bd95'
  )
  const capture = JSON.parse(bytes.toString()) as { stationId: string }
  const source = await withSystem('labelled-jps', (tx) =>
    makeSource(tx, {
      kind: 'jps_rain',
      externalId: capture.stationId,
      freshness: 'observed',
      cadenceS: 300,
      staleAfterS: 600
    })
  )
  const readings = parseJpsRainfall(capture, source as Source).filter((r) => r.observedAt.startsWith('2026-11-02'))
  const window = await s.run(async (tx) => {
    await makeProjectSource(tx, {
      projectId: s.projectId,
      sourceId: source.id,
      role: 'rain_gauge',
      createdAt: myt('00:00')
    })
    return makeWindow(tx, {
      projectId: s.projectId,
      startsAt: myt('15:30'),
      endsAt: myt('15:30'),
      kind: 'commute_wave'
    })
  })
  let now = myt('14:00'),
    ingested = 0
  const part = createEvaluatorPart({
    providers: s.providers,
    clock: () => now,
    tasks: { create: async () => {}, remove: async () => {} }
  })
  const trace: Array<{ at: string; mode: unknown; noCall: unknown }> = []
  let nextBatch = myt('14:00').getTime()
  while (now <= myt('16:30')) {
    if (now.getTime() === nextBatch) {
      let last: { source_id: string; poll_id: string; kind: 'jps_rain'; new_rows: number } | undefined
      await withSystem('labelled-batch', async (tx) => {
        for (const row of readings) {
          const observed = Date.parse(row.observedAt),
            started = observed + 300000,
            received = Math.ceil(started / 900000) * 900000
          if (received > now.getTime() || observed < myt('00:00').getTime() || observed <= ingested) continue
          const poll = await makePoll(tx, {
            sourceId: source.id,
            startedAt: new Date(started),
            receivedAt: new Date(received)
          })
          await makeReading(tx, {
            sourceId: source.id,
            pollId: poll.id,
            metric: row.metric,
            unit: row.unit,
            value: row.value as number,
            observedAt: new Date(observed),
            receivedAt: new Date(received)
          })
          ingested = observed
          last = { source_id: source.id, poll_id: poll.id, kind: 'jps_rain', new_rows: 1 }
        }
      })
      if (last)
        await part.topics!['readings-updated']!({
          data: last,
          attributes: {},
          messageId: 'batch-' + now.toISOString(),
          publishTime: now.toISOString()
        })
      else await part.batch!['evaluator-repair']!(now)
      nextBatch += 900000
    } else {
      const intent = await s.run((tx) => loadEvaluatorDeadline(tx, s.projectId))
      if (!intent) throw new Error('missing derived deadline')
      await part.queues!['evaluator-deadlines']!({
        name: null,
        retryCount: 0,
        body: { org: s.orgId, project: s.projectId, generation: intent.generation, dueAt: intent.dueAt }
      })
    }
    const [state] = await s.run((tx) => tx.select().from(shadowState).where(eq(shadowState.scopeId, window.id)))
    if (state)
      trace.push({
        at: now.toISOString(),
        mode: (state.verdict as Verdict).mode,
        noCall: (state.verdict as Verdict).noCall?.inputs.map((i) => i.name) ?? null
      })
    const deadline = await s.run((tx) => loadEvaluatorDeadline(tx, s.projectId))
    const next = Math.min(
      nextBatch,
      deadline && Date.parse(deadline.dueAt) > now.getTime() ? Date.parse(deadline.dueAt) : Infinity
    )
    now = new Date(next)
  }
  const crossings = await s.run((tx) =>
    tx.select().from(crossing).where(eq(crossing.scopeId, window.id)).orderBy(asc(crossing.at))
  )
  const required = crossings.filter((c) => c.at.getTime() === myt('15:15').getTime() && c.to === 'commute_disruption')
  expect(required).toHaveLength(1)
  expect(required[0]!.snapshotId).toBeTypeOf('string')
  const events = await s.run((tx) => tx.select().from(domainEvent).where(eq(domainEvent.type, 'crossing.detected')))
  expect(events.filter((e) => (e.data as { crossing_id: string }).crossing_id === required[0]!.id)).toHaveLength(1)
  expect(trace.find((r) => r.at === '2026-11-02T07:15:00.000Z')?.mode).toBe('commute_disruption')
  expect(crossings.map((c) => [c.at.toISOString(), c.from, c.to])).toEqual([
    ['2026-11-02T07:05:01.000Z', 'normal', null],
    ['2026-11-02T07:15:00.000Z', null, 'commute_disruption'],
    ['2026-11-02T07:20:01.000Z', 'commute_disruption', null],
    ['2026-11-02T07:30:00.000Z', null, 'commute_disruption'],
    ['2026-11-02T07:35:01.000Z', 'commute_disruption', null],
    ['2026-11-02T07:45:00.000Z', null, 'commute_disruption'],
    ['2026-11-02T07:50:01.000Z', 'commute_disruption', null],
    ['2026-11-02T08:00:00.000Z', null, 'commute_disruption'],
    ['2026-11-02T08:05:01.000Z', 'commute_disruption', null],
    ['2026-11-02T08:15:00.000Z', null, 'commute_disruption'],
    ['2026-11-02T08:20:01.000Z', 'commute_disruption', null],
    ['2026-11-02T08:30:00.000Z', null, 'commute_disruption']
  ])
}, 15000)

test('one returned gauge capture is recovered even when it includes missed frames; a later fresh capture releases Storm', async () => {
  const s = await scene(['storm_confirmed', 'silent_input'])
  const capture = JSON.parse(
    readFileSync(
      new URL('../../../packages/clauses/test/fixtures/rainfall-graph-75-20261105T1312Z.json', import.meta.url),
      'utf8'
    )
  ) as { stationId: string }
  const source = await s.run((tx) =>
    makeSource(tx, {
      kind: 'jps_rain',
      externalId: capture.stationId,
      freshness: 'observed',
      cadenceS: 300,
      staleAfterS: 600
    })
  )
  const readings = parseJpsRainfall(capture, source as Source).filter((r) => r.observedAt.startsWith('2026-11-02'))
  const window = await s.run(async (tx) => {
    await makeProjectSource(tx, {
      projectId: s.projectId,
      sourceId: source.id,
      role: 'rain_gauge',
      createdAt: myt('00:00')
    })
    return makeWindow(tx, {
      projectId: s.projectId,
      startsAt: myt('15:30'),
      endsAt: myt('15:30'),
      kind: 'commute_wave'
    })
  })
  async function captureAt(from: string, to: string, received: string) {
    await s.run(async (tx) => {
      const poll = await makePoll(tx, { sourceId: source.id, startedAt: myt(to), receivedAt: myt(received) })
      for (const row of readings.filter(
        (r) => Date.parse(r.observedAt) >= myt(from).getTime() && Date.parse(r.observedAt) <= myt(to).getTime()
      ))
        await makeReading(tx, {
          sourceId: source.id,
          pollId: poll.id,
          metric: row.metric,
          unit: row.unit,
          value: row.value as number,
          observedAt: new Date(row.observedAt),
          receivedAt: myt(received)
        })
    })
  }
  async function evaluate(time: string) {
    const tEval = myt(time).toISOString()
    await s.run((tx) => evaluateProject(tx, { projectId: s.projectId, tEval }, s.providers))
    const taken = await s.run((tx) =>
      s.providers.snapshots.take(tx, { projectId: s.projectId, pack: 'sky', tEval, persist: true, windows: [] })
    )
    const [state] = await s.run((tx) => tx.select().from(shadowState).where(eq(shadowState.scopeId, window.id)))
    return {
      input: taken.snapshot.inputs.find((i) => i.name === 'site.rain_60m_mm')!,
      storm: (state!.verdict as Verdict).clauses.find((c) => c.key === 'storm_confirmed')!
    }
  }
  await captureAt('00:00', '14:55', '15:00')
  expect((await evaluate('15:00')).input.state).toBe('fresh')
  expect((await evaluate('15:06')).input.state).toBe('stale')
  await captureAt('15:00', '15:15', '15:20')
  const first = await evaluate('15:20')
  expect(first.input.state).toBe('recovered')
  expect(first.storm.result).toBe('blocked')
  expect(first.storm.blockedBy.some((i) => i.state === 'recovered')).toBe(true)
  await captureAt('15:20', '15:20', '15:25')
  const second = await evaluate('15:25')
  expect(second.input.state).toBe('fresh')
  expect(second.storm.result).toBe('fired')
})
