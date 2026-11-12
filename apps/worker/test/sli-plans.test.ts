import { systemPrincipal, withTenant } from '@skyclause/db'
import { makeIndicatorSnapshot, makeOrganization, makeProject } from '@skyclause/db/test/factories/index'
import { asLogin } from '@skyclause/db/test/harness/index'
import { sql, type SQLWrapper } from 'drizzle-orm'
import { beforeAll, expect, test, vi } from 'vitest'
import { databaseReads } from '../src/sli/reads'

// #600: over a year of an organisation's rows, each tenant read of the `sli` batch reaches them through indexes, not
// by scanning the organisation's table, with the planner left to choose.

interface Plan {
  'Node Type': string
  'Relation Name'?: string
  Alias?: string
  'Index Cond'?: string
  Plans?: Plan[]
}

// While `explained.plans` is set, each tenant read is EXPLAINed in its own tenant transaction, then run.
const explained = vi.hoisted(() => ({ plans: undefined as Plan[] | undefined }))
vi.mock('@skyclause/db', async (importOriginal) => {
  const db = await importOriginal<typeof import('@skyclause/db')>()
  const withTenant: typeof db.withTenant = (ctx, fn) =>
    db.withTenant(ctx, async (tx) => {
      const read = fn(tx)
      if (explained.plans) {
        const { rows } = await tx.execute<{ 'QUERY PLAN': Array<{ Plan: Plan }> }>(
          sql`EXPLAIN (FORMAT JSON) ${read as unknown as SQLWrapper}`
        )
        explained.plans.push(rows[0]!['QUERY PLAN'][0]!.Plan)
      }
      return read
    })
  return { ...db, withTenant }
})

const nodes = (plan: Plan): Plan[] => [plan, ...(plan.Plans ?? []).flatMap(nodes)]

/** Each organisation's plan of `read`, as each scanned table's alias → its index conditions ('' for a scan). */
async function indexConditions(read: () => Promise<unknown>) {
  explained.plans = []
  try {
    await read()
    expect(explained.plans).toHaveLength(ORGANISATIONS)
    return explained.plans.map((plan) =>
      Object.fromEntries(
        nodes(plan)
          .filter((node) => node['Relation Name'])
          .map((scan) => [
            scan.Alias,
            nodes(scan)
              .map((node) => node['Index Cond'] ?? '')
              .join(' ')
          ])
      )
    )
  } finally {
    explained.plans = undefined
  }
}

const ORGANISATIONS = 2
const window = { from: new Date('2026-05-06T09:30:00Z'), to: new Date('2026-05-06T09:45:00Z') }
const hour = { from: new Date('2026-05-06T08:45:00Z'), to: window.to }
const reads = databaseReads()

// Each organisation: a run every 3 hours for a year, half from a crossing; 7 in 10 bundles reach Needs review with a
// 30-minute SLA and an on-duty alert, 6 in 10 are approved; two calls each, with two notices once approved. Generated in
// SQL as `postgres` (factories would take minutes), each table under ANALYZE's 30,000-row sample, so its statistics
// are exact.
beforeAll(async () => {
  const organisations: Array<{ orgId: string; projectId: string; id: string }> = []
  for (let o = 0; o < ORGANISATIONS; o++) {
    const orgId = (await makeOrganization()).id
    const snapshot = await withTenant({ orgId, principal: systemPrincipal('test') }, async (tx) =>
      makeIndicatorSnapshot(tx, { projectId: (await makeProject(tx)).id })
    )
    organisations.push(snapshot)
  }
  await asLogin('postgres', async (client) => {
    await client.query(
      `CREATE TEMP TABLE slot AS SELECT o.org, o.project, o.snapshot,
        timestamptz '2025-11-06T00:35:00Z' + i * interval '3 hours' AS t, i % 2 = 0 AS crossed, i % 10 < 7 AS reviewed,
        i % 10 < 6 AS approved, md5(o.org || 'c' || i)::uuid AS crossing, md5(o.org || 'r' || i)::uuid AS run,
        md5(o.org || 'b' || i)::uuid AS bundle
      FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) o (org, project, snapshot), generate_series(1, 3000) i`,
      [organisations.map((s) => s.orgId), organisations.map((s) => s.projectId), organisations.map((s) => s.id)]
    )
    for (const statement of [
      `INSERT INTO crossing (id, org_id, project_id, pack, scope_kind, "to", at, snapshot_id, verdict_hash)
      SELECT crossing, org, project, 'sky', 'site', 'amber', t - interval '2 minutes', snapshot, md5(crossing::text)
      FROM slot WHERE crossed`,
      `INSERT INTO run (id, org_id, project_id, pack, trigger, dedupe_key, status, triggered_at)
      SELECT run, org, project, 'sky', CASE WHEN crossed THEN 'crossing' ELSE 'schedule' END::run_trigger,
        CASE WHEN crossed THEN 'crossing:' || crossing ELSE 'schedule:' || run END, 'drafted', t FROM slot`,
      `INSERT INTO bundle (id, org_id, project_id, run_id, pack, state, review_hash, needs_review_at, sla_due_at,
        approved_at)
      SELECT bundle, org, project, run, 'sky',
        CASE WHEN approved THEN 'approved' WHEN reviewed THEN 'needs_review' ELSE 'closed' END::bundle_state,
        md5(bundle::text), CASE WHEN reviewed THEN t END, CASE WHEN reviewed THEN t + interval '30 minutes' END,
        CASE WHEN approved THEN t + interval '4 minutes' END
      FROM slot`,
      `INSERT INTO bundle_alert (org_id, bundle_id, account_id, channel, level, accepted_at)
      SELECT org, bundle, org, 'web_push', 'on_duty', t + interval '20 seconds' FROM slot WHERE reviewed`,
      `INSERT INTO approval (org_id, project_id, bundle_id, actor_id, action, created_at)
      SELECT org, project, bundle, org, 'approve', t + interval '4 minutes' FROM slot WHERE approved`,
      `INSERT INTO call (id, org_id, project_id, bundle_id, shadow, chosen, agrees, expires_at, triggered_at, approved_at)
      SELECT md5(bundle::text || k)::uuid, org, project, bundle, '{}', 'engine', true, t + interval '1 day', t,
        CASE WHEN approved THEN t + interval '4 minutes' END
      FROM slot, generate_series(1, 2) k`,
      `INSERT INTO notice (org_id, project_id, kind, channel, idempotency_key, call_id, language, status, accepted_at)
      SELECT org, project, 'call', 'email', md5(bundle::text || k || n), md5(bundle::text || k)::uuid, 'en', 'sent',
        t + interval '4 minutes 10 seconds'
      FROM slot, generate_series(1, 2) k, generate_series(1, 2) n WHERE approved`,
      'ANALYZE'
    ])
      await client.query(statement)
  })
}, 60_000)

test('approver alerted finds bundles by needs_review_at and their alerts by bundle', async () => {
  for (const plan of await indexConditions(() => reads.approverAlerts(window, 60)))
    expect(plan).toEqual({
      bundle: expect.stringContaining('needs_review_at'),
      bundle_alert: expect.stringContaining('bundle_id = bundle.id')
    })
})

test('approval to provider finds calls by approved_at and their notices by call', async () => {
  for (const plan of await indexConditions(() => reads.handovers(hour)))
    expect(plan).toEqual({
      call: expect.stringContaining('approved_at'),
      notice: expect.stringContaining('call_id = call.id')
    })
})

test('approval SLA finds bundles by sla_due_at, their approvals by bundle and successors by ID', async () => {
  for (const plan of await indexConditions(() => reads.slaDue(window)))
    expect(plan).toEqual({
      bundle: expect.stringContaining('sla_due_at'),
      approval: expect.stringContaining('bundle_id = bundle.id'),
      successor: expect.stringContaining('id = bundle.superseded_by')
    })
})

test('crossing to needs review finds bundles by needs_review_at and the crossings their runs serve by ID', async () => {
  for (const plan of await indexConditions(() => reads.reviews(hour)))
    expect(plan).toEqual({
      bundle: expect.stringContaining('needs_review_at'),
      run: expect.stringContaining('id = bundle.run_id'),
      crossing: expect.stringMatching(/^\(id = /)
    })
})
