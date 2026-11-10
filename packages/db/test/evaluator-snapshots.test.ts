import { expect, test } from 'vitest'
import { canonicalHash, snapshotAt, type IndicatorRegistry, type Window } from '@skyclause/clauses'
import { sql } from 'drizzle-orm'
import { withTenant, saveEvaluatorSnapshot, loadEvaluatorSnapshot, loadEvaluatorRegistry } from '../src'
import { makeOrganization, makeProject, makeIndicatorSnapshot } from './factories'
import { asLogin, memberOf, refusal } from './harness'

const registry: IndicatorRegistry = [
  { name: 'w.met_warning_in_force', celType: 'bool', unit: '', scope: 'window', sourceKind: 'met_warning' }
]
const tEval = '2026-11-10T04:00:00.000Z'
const windows: Window[] = [
  { id: 'frozen-window', startsAt: tEval, endsAt: '2026-11-10T06:00:00Z', kind: 'class', tz: 'Asia/Kuala_Lumpur' }
]
async function scene() {
  const orgId = (await makeOrganization()).id
  const run = <T>(fn: Parameters<typeof withTenant<T>>[1]) => withTenant({ orgId, principal: memberOf(orgId) }, fn)
  const p = await run((tx) => makeProject(tx))
  const snapshot = snapshotAt(
    {
      sources: [
        {
          id: 'warning',
          kind: 'met_warning',
          cadenceS: 300,
          staleAfterS: 1800,
          freshness: 'polled',
          probation: false,
          meta: {}
        }
      ],
      polls: [{ id: 'poll', sourceId: 'warning', startedAt: tEval, receivedAt: tEval, outcome: 'ok', httpStatus: 200 }],
      readings: [
        {
          id: 'reading',
          sourceId: 'warning',
          metric: 'warning',
          observedAt: '2026-11-10T03:00:00Z',
          receivedAt: '2026-11-10T03:02:00Z',
          value: 1,
          valueText: null,
          valueJson: { valid_from_utc: '2026-11-10T02:00:00Z', valid_to_utc: '2026-11-10T08:00:00Z' },
          itemKey: '',
          revision: 1
        }
      ]
    },
    registry,
    p.id,
    'sky',
    tEval
  )
  return { orgId, run, p, snapshot }
}
test('immutable full snapshot, warning clocks, definitions and frozen windows round trip', async () => {
  const { run, p, snapshot } = await scene()
  expect(snapshot.warningObservations?.['reading']).toMatchObject({
    receivedAt: '2026-11-10T03:02:00Z',
    validTo: '2026-11-10T08:00:00Z'
  })
  const first = await run((tx) => saveEvaluatorSnapshot(tx, { snapshot, registry, windows }))
  const changed = { ...snapshot, nights: [], inputs: [] }
  changed.hash = canonicalHash(Object.fromEntries(Object.entries(changed).filter(([key]) => key !== 'hash')))
  const second = await run((tx) => saveEvaluatorSnapshot(tx, { snapshot: changed, registry, windows: [] }))
  expect(second).toEqual(first)
  const stored = await run((tx) => loadEvaluatorSnapshot(tx, { projectId: p.id, pack: 'sky', tEval }))
  expect(stored).toEqual({ ...first, registry, windows })
  expect(
    await run((tx) => loadEvaluatorRegistry(tx, { projectId: p.id, pack: 'sky', registryHash: snapshot.registryHash }))
  ).toEqual(registry)
  expect(
    await run((tx) =>
      refusal(tx.execute(sql`UPDATE indicator_snapshot SET hash = 'changed' WHERE id = ${first.snapshotId}`))
    )
  ).toMatch(/append.only|permission denied/i)
})
test('two overlapping tenant connections converge on original body and one row', async () => {
  const { run, p, snapshot } = await scene()
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let inserted!: () => void
  const ready = new Promise<void>((resolve) => {
    inserted = resolve
  })
  const first = run(async (tx) => {
    const pid = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)
    const saved = await saveEvaluatorSnapshot(tx, { snapshot, registry, windows })
    inserted()
    await held
    return { saved, pid: pid.rows[0]!.pid }
  })
  await Promise.race([ready, first])
  const candidate = { ...snapshot, inputs: [] }
  candidate.hash = canonicalHash(Object.fromEntries(Object.entries(candidate).filter(([key]) => key !== 'hash')))
  let secondPid!: number
  let started!: () => void
  const starting = new Promise<void>((resolve) => {
    started = resolve
  })
  const second = run(async (tx) => {
    const pid = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)
    secondPid = pid.rows[0]!.pid
    started()
    return {
      saved: await saveEvaluatorSnapshot(tx, { snapshot: candidate, registry, windows: [] }),
      pid: pid.rows[0]!.pid
    }
  })
  await Promise.race([starting, second])
  let waited = false
  try {
    waited = await asLogin('postgres', async (client) => {
      for (let attempt = 0; attempt < 200; attempt++) {
        const result = await client.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1', [secondPid])
        if (result.rows[0]?.wait_event_type === 'Lock') return true
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
      return false
    })
  } finally {
    release()
  }
  const [a, b] = await Promise.all([first, second])
  expect(waited).toBe(true)
  expect(a.pid).not.toBe(b.pid)
  expect(b.saved).toEqual(a.saved)
  const rows = await asLogin('postgres', (client) =>
    client.query('SELECT count(*)::int AS n FROM indicator_snapshot WHERE project_id = $1', [p.id])
  )
  expect(rows.rows).toEqual([{ n: 1 }])
})
test.each(['registry', 'windows', 'incomplete'] as const)(
  'corrupt %s archive is rejected instead of replaying approximate context',
  async (field) => {
    const { run, p, snapshot } = await scene()
    const saved = await run((tx) => saveEvaluatorSnapshot(tx, { snapshot, registry, windows }))
    await asLogin('retention', (client) =>
      client.query(
        field === 'registry'
          ? "UPDATE indicator_snapshot SET registry_definitions = '[]' WHERE id = $1"
          : field === 'windows'
            ? "UPDATE indicator_snapshot SET frozen_windows = '[]' WHERE id = $1"
            : "UPDATE indicator_snapshot SET snapshot_body = snapshot_body - 'registryHash' WHERE id = $1",
        [saved.snapshotId]
      )
    )
    await expect(run((tx) => loadEvaluatorSnapshot(tx, { projectId: p.id, pack: 'sky', tEval }))).rejects.toThrow()
  }
)
test('legacy body and corrupt hashes are explicit unavailability, never reconstructed', async () => {
  const { run, p, snapshot } = await scene()
  await run((tx) => makeIndicatorSnapshot(tx, { projectId: p.id, tEval: new Date(tEval) }))
  await expect(run((tx) => saveEvaluatorSnapshot(tx, { snapshot, registry, windows }))).rejects.toMatchObject({
    name: 'NotBuiltError',
    owner: 'b-evaluator:snapshot-body'
  })
  await expect(
    run((tx) => loadEvaluatorRegistry(tx, { projectId: p.id, pack: 'sky', registryHash: 'unknown' }))
  ).rejects.toMatchObject({ owner: 'b-evaluator:historical-registry' })
  const fresh = await scene()
  const saved = await fresh.run((tx) => saveEvaluatorSnapshot(tx, { snapshot: fresh.snapshot, registry, windows }))
  await asLogin('retention', (client) =>
    client.query(
      "UPDATE indicator_snapshot SET snapshot_body = jsonb_set(snapshot_body, '{hash}', '\"corrupt\"') WHERE id = $1",
      [saved.snapshotId]
    )
  )
  await expect(
    fresh.run((tx) => loadEvaluatorSnapshot(tx, { projectId: fresh.p.id, pack: 'sky', tEval }))
  ).rejects.toThrow(/hash/)
})
test('snapshot and historical registry lookup enforce tenant project and pack identity', async () => {
  const { run, p, snapshot } = await scene()
  await run((tx) => saveEvaluatorSnapshot(tx, { snapshot, registry, windows }))
  const otherOrg = (await makeOrganization()).id
  await expect(
    withTenant({ orgId: otherOrg, principal: memberOf(otherOrg) }, (tx) =>
      loadEvaluatorSnapshot(tx, { projectId: p.id, pack: 'sky', tEval })
    )
  ).rejects.toMatchObject({ owner: 'b-evaluator:snapshot-body' })
  await expect(
    withTenant({ orgId: otherOrg, principal: memberOf(otherOrg) }, (tx) =>
      saveEvaluatorSnapshot(tx, { snapshot, registry, windows })
    )
  ).rejects.toThrow()
  await expect(
    run((tx) => loadEvaluatorRegistry(tx, { projectId: p.id, pack: 'crowd', registryHash: snapshot.registryHash }))
  ).rejects.toMatchObject({ owner: 'b-evaluator:historical-registry' })
})
