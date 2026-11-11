import { sql } from 'drizzle-orm'
import { describe, expect, test } from 'vitest'
import { analyticsEvent, withSystem, withTenant } from '../src'
import { makeOrganization, makeProject } from './factories/index'
import { asLogin, memberOf, refusal } from './harness/index'

type ActivationRow = {
  org_id: string
  first_project_id: string | null
  org_created_at: Date | string | null
  project_created_at: Date | string | null
  source_bound_at: Date | string | null
  window_declared_at: Date | string | null
  rota_set_at: Date | string | null
  channel_connected_at: Date | string | null
  call_graded_at: Date | string | null
  activated: boolean
}

describe('b-create-project-ui activation view', () => {
  test('activates a first-project grade on day 6 and rejects day 8, second-project-only grades, and no declared window', async () => {
    const cases = [] as Array<{ orgId: string; slug: string; projectId: string; expected: boolean }>
    for (const [slug, expected, gradeDay, gradeProject, withWindow] of [
      ['activation-day-six', true, 6, 'first', true],
      ['activation-day-eight', false, 8, 'first', true],
      ['activation-second-project', false, 6, 'second', true],
      ['activation-no-window', false, 6, 'first', false]
    ] as const) {
      const org = await makeOrganization({ slug })
      const projects = await withTenant({ orgId: org.id, principal: memberOf(org.id) }, async (tx) => ({
        first: await makeProject(tx, { slug: 'first' }),
        second: await makeProject(tx, { slug: 'second' })
      }))
      const first = projects.first
      const gradeTarget = gradeProject === 'first' ? first : projects.second
      const orgCreatedAt = new Date('2026-11-01T00:00:00.000Z')
      const events = [
        { name: 'org_created', projectId: null, props: { plan: 'community' }, at: orgCreatedAt },
        {
          name: 'project_created',
          projectId: first.id,
          props: { packs: ['sky'] },
          at: new Date('2026-11-01T00:01:00.000Z')
        },
        ...(withWindow
          ? [
              {
                name: 'window_declared',
                projectId: first.id,
                props: { via: 'form', recurring: false },
                at: new Date('2026-11-02T00:00:00.000Z')
              }
            ]
          : []),
        {
          name: 'call_graded',
          projectId: gradeTarget.id,
          props: { pack: 'sky', grade: 'correct' },
          at: new Date(`2026-11-${String(1 + gradeDay).padStart(2, '0')}T00:00:00.000Z`)
        }
      ]
      await withSystem('test', async (tx) => {
        for (const event of events) {
          await tx.insert(analyticsEvent).values({ orgId: org.id, ...event })
        }
      })
      cases.push({ orgId: org.id, slug, projectId: first.id, expected })
    }

    const rows = await withSystem('test', async (tx) => {
      const selected: ActivationRow[] = []
      for (const { orgId } of cases) {
        const result = await tx.execute(sql<ActivationRow>`SELECT * FROM onboarding_activation WHERE org_id = ${orgId}`)
        selected.push(...(result.rows as ActivationRow[]))
      }
      return selected
    })
    expect(rows).toHaveLength(4)
    const daySix = rows.find((row) => row.org_id === cases[0]!.orgId)!
    expect(new Date(daySix.org_created_at!).toISOString()).toBe('2026-11-01T00:00:00.000Z')
    expect(new Date(daySix.project_created_at!).toISOString()).toBe('2026-11-01T00:01:00.000Z')
    expect(new Date(daySix.window_declared_at!).toISOString()).toBe('2026-11-02T00:00:00.000Z')
    expect(new Date(daySix.call_graded_at!).toISOString()).toBe('2026-11-07T00:00:00.000Z')
    for (const { orgId, expected } of cases) {
      expect(rows.find((row) => row.org_id === orgId)?.activated).toBe(expected)
    }
    expect(rows.find((row) => row.org_id === cases[0]!.orgId)).toMatchObject({
      first_project_id: cases[0]!.projectId,
      activated: true
    })
  })

  test('the activation view is readable by system and denied to app', async () => {
    const org = await makeOrganization({ slug: 'activation-view-permissions' })
    const row = await withSystem('test', async (tx) => {
      const result = await tx.execute(sql<ActivationRow>`SELECT * FROM onboarding_activation WHERE org_id = ${org.id}`)
      return (result.rows as ActivationRow[])[0] ?? null
    })
    expect(row?.org_id).toBe(org.id)
    await expect(
      refusal(asLogin('app', async (client) => client.query('SELECT * FROM onboarding_activation LIMIT 1')))
    ).resolves.toMatch(/permission denied/i)
  })
})
