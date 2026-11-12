import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { expect, test } from 'vitest'
import {
  createNativeWindowSeries,
  lockWindowParents,
  mutateWindowSet,
  withTenant,
  writeWindowChange,
  type Tx,
  type WindowMutationInsert
} from '../src'
import { domainEvent, window, windowSeries } from '../src/schema'
import { makeOrganization, makeProject, makeWindow, makeWindowSeries } from './factories'
import { asLogin, memberOf } from './harness'

const now = new Date('2026-11-08T02:00:00Z')
async function scene() {
  const { id: orgId } = await makeOrganization()
  const principal = memberOf(orgId)
  const run = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal }, fn)
  const project = await run(makeProject)
  const definition = {
    version: 1 as const,
    source: 'native' as const,
    anchor: '2026-11-16',
    dateOffsetDays: 0,
    endDayOffset: 0,
    title: 'Lecture',
    kind: 'class' as const,
    tz: 'Asia/Kuala_Lumpur',
    provenance: { declaredBy: 'original-account-id', via: 'app' as const, shareLinkId: null, guest: false as const }
  }
  const series = await run((tx) => makeWindowSeries(tx, { projectId: project.id, definition }))
  const values: WindowMutationInsert = {
    projectId: project.id,
    title: 'Lecture',
    kind: 'class',
    tz: 'Asia/Kuala_Lumpur',
    startsAt: new Date('2026-11-16T01:00:00Z'),
    endsAt: new Date('2026-11-16T02:00:00Z'),
    ...definition.provenance,
    seriesId: series.id,
    seriesOccurrenceDate: '2026-11-16'
  }
  const row = await run((tx) => makeWindow(tx, values))
  return { orgId, principal, run, project, series, row, values, definition }
}
function signal<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { resolve, promise }
}

test('membership discovery waits for the parent and includes a concurrently committed extension', async () => {
  const c = await scene()
  const locked = signal<void>(),
    release = signal<void>(),
    backend = signal<number>()
  const extension = c.run(async (tx) => {
    await lockWindowParents(tx, [], [c.values])
    const added = await writeWindowChange(tx, {
      kind: 'create',
      values: {
        ...c.values,
        seriesOccurrenceDate: '2026-11-23',
        startsAt: new Date('2026-11-23T01:00:00Z'),
        endsAt: new Date('2026-11-23T02:00:00Z')
      },
      now
    })
    locked.resolve()
    await release.promise
    return added
  })
  await locked.promise
  const edit = c.run(async (tx) => {
    const { rows } = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)
    backend.resolve(rows[0]!.pid)
    return mutateWindowSet(tx, { id: c.row.id, scope: 'series', now }, async (state) => ({
      changes: state.members.map((row) => ({ kind: 'update', id: row.id, patch: { title: 'Revised' }, now }))
    }))
  })
  try {
    const pid = await backend.promise
    await expect
      .poll(
        async () =>
          (
            await asLogin('postgres', (client) =>
              client.query<{ n: number }>('SELECT cardinality(pg_blocking_pids($1)) AS n', [pid])
            )
          ).rows[0]!.n
      )
      .toBe(1)
  } finally {
    release.resolve()
  }
  const added = await extension
  const selected = await edit
  expect(selected?.id).toBe(c.row.id)
  expect((await c.run((tx) => tx.select().from(window))).map((row) => [row.id, row.title]).sort()).toEqual(
    [
      [c.row.id, 'Revised'],
      [added.id, 'Revised']
    ].sort()
  )
})

test('a full mixed plan prelocks all existing IDs before its first create/event and commits all changes', async () => {
  const c = await scene()
  const another = await c.run((tx) => makeWindow(tx, { ...c.values, seriesOccurrenceDate: '2026-11-18' }))
  await c.run((tx) =>
    mutateWindowSet(tx, { id: c.row.id, scope: 'series', now }, async (state) => ({
      changes: [
        { kind: 'create', values: { ...c.values, seriesOccurrenceDate: '2026-11-23' }, now },
        ...state.members.map((row) => ({ kind: 'update' as const, id: row.id, patch: { title: 'Both' }, now }))
      ]
    }))
  )
  const state = await c.run(async (tx) => ({
    windows: await tx.select().from(window),
    events: await tx.select().from(domainEvent)
  }))
  expect(state.windows).toHaveLength(3)
  expect(
    state.windows.filter((row) => [c.row.id, another.id].includes(row.id)).every((row) => row.title === 'Both')
  ).toBe(true)
  expect(state.events.map((row) => row.type)).toEqual(['window.created', 'window.updated', 'window.updated'])
})

test.each(['target', 'parent', 'project'] as const)(
  'orchestration rejects a planner escaping its %s before any metadata or event writes',
  async (escape) => {
    const c = await scene()
    const outside = await c.run((tx) => makeWindow(tx, { projectId: c.project.id }))
    const before = await c.run(async (tx) => ({
      rows: await tx.select().from(window),
      series: await tx.select().from(windowSeries),
      events: await tx.select().from(domainEvent)
    }))
    await expect(
      c.run((tx) =>
        mutateWindowSet(tx, { id: c.row.id, scope: 'series', now }, async () => ({
          seriesPatch: { cancelledAt: now },
          changes:
            escape === 'target'
              ? [{ kind: 'cancel', id: outside.id, origin: 'manual', now }]
              : [
                  {
                    kind: 'create',
                    values: {
                      ...c.values,
                      seriesOccurrenceDate: '2026-11-23',
                      ...(escape === 'parent' ? { seriesId: randomUUID() } : { projectId: randomUUID() })
                    },
                    now
                  }
                ]
        }))
      )
    ).rejects.toThrow(/escaped/)
    expect(
      await c.run(async (tx) => ({
        rows: await tx.select().from(window),
        series: await tx.select().from(windowSeries),
        events: await tx.select().from(domainEvent)
      }))
    ).toEqual(before)
  }
)

test('new series creation rejects occurrence project/provenance mismatches before inserting its parent', async () => {
  const c = await scene()
  const other = await c.run(makeProject)
  for (const occurrences of [
    [{ ...c.values, projectId: other.id, seriesId: undefined }],
    [{ ...c.values, declaredBy: 'spoof', seriesId: undefined }]
  ]) {
    await expect(
      c.run((tx) =>
        createNativeWindowSeries(tx, {
          projectId: c.project.id,
          definition: c.definition,
          rule: { frequency: 'weekly', days_of_week: ['monday'], count: 1, skip_dates: [] },
          localStart: '09:00',
          localEnd: '10:00',
          materialisedUntil: '2027-02-06',
          checkedOn: '2026-11-08',
          now,
          occurrences
        })
      )
    ).rejects.toThrow()
  }
  expect(await c.run((tx) => tx.select().from(windowSeries))).toEqual([c.series])
  expect(await c.run((tx) => tx.select().from(domainEvent))).toEqual([])
})
