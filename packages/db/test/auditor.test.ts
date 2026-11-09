import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import {
  auditFinding,
  listAuditOrganisations,
  reconcileAuditFindings,
  systemPrincipal,
  withPublicReader,
  withRetention,
  withSystem,
  withTenant
} from '../src'
import { makeOrganization, makeProject } from './factories'
import { memberOf, refusal } from './harness'

function barrier(n = 2) {
  let count = 0
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  return async () => {
    count += 1
    if (count >= n) release()
    await gate
  }
}

test('same nullable identity opens once', async () => {
  const [orgA, orgB] = [(await makeOrganization()).id, (await makeOrganization()).id]
  const [projA1, projA2] = await withTenant({ orgId: orgA, principal: memberOf(orgA) }, async (tx) => [
    (await makeProject(tx)).id,
    (await makeProject(tx)).id
  ])
  const accountId = randomUUID()
  const now = new Date('2026-11-09T12:00:00Z')

  // Null projectId within an organisation across two independent transactions
  const syncOrg = barrier(2)
  const finding = {
    key: 'gauge-silent',
    projectId: null,
    accountIds: [accountId],
    ref: { type: 'source', id: '0232901RF' }
  }
  const [orgRes1, orgRes2] = await Promise.all([
    withTenant({ orgId: orgA, principal: systemPrincipal('auditor') }, async (tx) => {
      await syncOrg()
      return reconcileAuditFindings(tx, { check: 'source-freshness', orgId: orgA, now, findings: [finding] })
    }),
    withTenant({ orgId: orgA, principal: systemPrincipal('auditor') }, async (tx) => {
      await syncOrg()
      return reconcileAuditFindings(tx, { check: 'source-freshness', orgId: orgA, now, findings: [finding] })
    })
  ])
  const orgOpened = [...orgRes1.opened, ...orgRes2.opened]
  expect(orgOpened).toHaveLength(1)
  expect([...orgRes1.recovered, ...orgRes2.recovered]).toEqual([])

  // All-null platform identity across two independent transactions
  const syncPlatform = barrier(2)
  const platformFinding = {
    key: 'kek-age',
    projectId: null,
    accountIds: [],
    ref: { type: 'kek', id: 'primary' }
  }
  const [platRes1, platRes2] = await Promise.all([
    withSystem('auditor', async (tx) => {
      await syncPlatform()
      return reconcileAuditFindings(tx, { check: 'kek-rotation', orgId: null, now, findings: [platformFinding] })
    }),
    withSystem('auditor', async (tx) => {
      await syncPlatform()
      return reconcileAuditFindings(tx, { check: 'kek-rotation', orgId: null, now, findings: [platformFinding] })
    })
  ])
  const platOpened = [...platRes1.opened, ...platRes2.opened]
  expect(platOpened).toHaveLength(1)

  // Same key in org B and in two projects of org A are distinct findings
  const orgBRes = await withTenant({ orgId: orgB, principal: systemPrincipal('auditor') }, (tx) =>
    reconcileAuditFindings(tx, { check: 'source-freshness', orgId: orgB, now, findings: [finding] })
  )
  expect(orgBRes.opened).toHaveLength(1)
  expect(orgBRes.opened[0]!.id).not.toBe(orgOpened[0]!.id)

  const twoProjectsRes = await withTenant({ orgId: orgA, principal: systemPrincipal('auditor') }, (tx) =>
    reconcileAuditFindings(tx, {
      check: 'source-freshness',
      orgId: orgA,
      now,
      findings: [finding, { ...finding, projectId: projA1 }, { ...finding, projectId: projA2 }]
    })
  )
  expect(twoProjectsRes.opened.map((r) => r.projectId).sort()).toEqual([projA1, projA2].sort())
  expect(twoProjectsRes.recovered).toEqual([])

  const rowsA = await withTenant({ orgId: orgA, principal: systemPrincipal('auditor') }, (tx) =>
    tx.select().from(auditFinding).where(eq(auditFinding.check, 'source-freshness'))
  )
  expect(rowsA).toHaveLength(3)
})

test('concurrent recovery returns one winner', async () => {
  const orgId = (await makeOrganization()).id
  const accountId = randomUUID()
  const openedAt = new Date('2026-11-09T12:00:00Z')
  const recoveredAt = new Date('2026-11-09T12:15:00Z')

  const { opened } = await withTenant({ orgId, principal: systemPrincipal('auditor') }, (tx) =>
    reconcileAuditFindings(tx, {
      check: 'source-freshness',
      orgId,
      now: openedAt,
      findings: [
        {
          key: 'gauge-silent',
          projectId: null,
          accountIds: [accountId],
          ref: { type: 'source', id: '0232901RF' }
        }
      ]
    })
  )
  expect(opened).toHaveLength(1)

  const sync = barrier(2)
  const [res1, res2] = await Promise.all([
    withTenant({ orgId, principal: systemPrincipal('auditor') }, async (tx) => {
      await sync()
      return reconcileAuditFindings(tx, { check: 'source-freshness', orgId, now: recoveredAt, findings: [] })
    }),
    withTenant({ orgId, principal: systemPrincipal('auditor') }, async (tx) => {
      await sync()
      return reconcileAuditFindings(tx, { check: 'source-freshness', orgId, now: recoveredAt, findings: [] })
    })
  ])
  const winners = [...res1.recovered, ...res2.recovered]
  expect(winners).toHaveLength(1)
  expect(winners[0]).toMatchObject({
    id: opened[0]!.id,
    accountIds: [accountId],
    refType: 'source',
    refId: '0232901RF',
    recoveredAt
  })
})

test('reopening allocates a new id', async () => {
  const orgId = (await makeOrganization()).id
  const t0 = new Date('2026-11-09T12:00:00Z')
  const t1 = new Date('2026-11-09T12:15:00Z')
  const t2 = new Date('2026-11-09T12:30:00Z')
  const finding = {
    key: 'crossing-held',
    projectId: null,
    accountIds: [randomUUID()],
    ref: { type: 'crossing', id: 'c-1' }
  }

  const first = await withTenant({ orgId, principal: systemPrincipal('auditor') }, (tx) =>
    reconcileAuditFindings(tx, { check: 'crossing-run', orgId, now: t0, findings: [finding] })
  )
  const cleared = await withTenant({ orgId, principal: systemPrincipal('auditor') }, (tx) =>
    reconcileAuditFindings(tx, { check: 'crossing-run', orgId, now: t1, findings: [] })
  )
  const second = await withTenant({ orgId, principal: systemPrincipal('auditor') }, (tx) =>
    reconcileAuditFindings(tx, { check: 'crossing-run', orgId, now: t2, findings: [finding] })
  )

  expect(first.opened).toHaveLength(1)
  expect(cleared.recovered.map((r) => r.id)).toEqual([first.opened[0]!.id])
  expect(second.opened).toHaveLength(1)
  expect(second.opened[0]!.id).not.toBe(first.opened[0]!.id)
  expect(second.opened[0]!.recoveredAt).toBeNull()

  const stored = await withTenant({ orgId, principal: systemPrincipal('auditor') }, (tx) =>
    tx.select().from(auditFinding).where(eq(auditFinding.check, 'crossing-run'))
  )
  expect(stored).toHaveLength(2)
})

test('newer opening survives stale tick', async () => {
  const orgId = (await makeOrganization()).id
  const newerNow = new Date('2026-11-09T12:15:00Z')
  const staleNow = new Date('2026-11-09T12:00:00Z')
  const finding = {
    key: 'gauge-silent',
    projectId: null,
    accountIds: [randomUUID()],
    ref: { type: 'source', id: '0232901RF' }
  }

  const opened = await withTenant({ orgId, principal: systemPrincipal('auditor') }, (tx) =>
    reconcileAuditFindings(tx, { check: 'source-freshness', orgId, now: newerNow, findings: [finding] })
  )
  expect(opened.opened).toHaveLength(1)

  const stale = await withTenant({ orgId, principal: systemPrincipal('auditor') }, (tx) =>
    reconcileAuditFindings(tx, { check: 'source-freshness', orgId, now: staleNow, findings: [] })
  )
  expect(stale.recovered).toEqual([])

  const [stillOpen] = await withTenant({ orgId, principal: systemPrincipal('auditor') }, (tx) =>
    tx.select().from(auditFinding).where(eq(auditFinding.id, opened.opened[0]!.id))
  )
  expect(stillOpen?.recoveredAt).toBeNull()
})

test('listAuditOrganisations includes empty organisations and S policies refuse app and public_reader', async () => {
  const [emptyOrg, orgWithProject] = [(await makeOrganization()).id, (await makeOrganization()).id]
  const otherOrg = (await makeOrganization()).id
  const projectInA = await withTenant({ orgId: orgWithProject, principal: memberOf(orgWithProject) }, (tx) =>
    makeProject(tx)
  )
  const now = new Date('2026-11-09T12:00:00Z')

  const orgs = await withSystem('auditor', (tx) => listAuditOrganisations(tx))
  expect(orgs).toEqual(expect.arrayContaining([emptyOrg, orgWithProject, otherOrg]))

  // Cross-org project FK rejection
  expect(
    await refusal(
      withTenant({ orgId: otherOrg, principal: systemPrincipal('auditor') }, (tx) =>
        reconcileAuditFindings(tx, {
          check: 'source-freshness',
          orgId: otherOrg,
          now,
          findings: [
            {
              key: 'cross-org-project',
              projectId: projectInA.id,
              accountIds: [],
              ref: { type: 'project', id: projectInA.id }
            }
          ]
        })
      )
    )
  ).toMatch(/audit_finding_project_fk/)

  // Open an org finding and verify platform scan leaves it untouched
  const orgOpen = await withTenant({ orgId: orgWithProject, principal: systemPrincipal('auditor') }, (tx) =>
    reconcileAuditFindings(tx, {
      check: 'shared-check-name',
      orgId: orgWithProject,
      now,
      findings: [
        {
          key: 'org-condition',
          projectId: projectInA.id,
          accountIds: [],
          ref: { type: 'project', id: projectInA.id }
        }
      ]
    })
  )
  expect(orgOpen.opened).toHaveLength(1)

  const platformSweep = await withSystem('auditor', (tx) =>
    reconcileAuditFindings(tx, {
      check: 'shared-check-name',
      orgId: null,
      now: new Date('2026-11-09T12:15:00Z'),
      findings: []
    })
  )
  expect(platformSweep.recovered).toEqual([])

  // Tenant RLS isolates orgWithProject from otherOrg
  const seenByOther = await withTenant({ orgId: otherOrg, principal: systemPrincipal('auditor') }, (tx) =>
    tx.select().from(auditFinding).where(eq(auditFinding.id, orgOpen.opened[0]!.id))
  )
  expect(seenByOther).toEqual([])

  // Retention can read/delete S rows, while app and public_reader are refused
  const seenByRetention = await withRetention('retention-check', (tx) =>
    tx.select().from(auditFinding).where(eq(auditFinding.id, orgOpen.opened[0]!.id))
  )
  expect(seenByRetention).toHaveLength(1)

  expect(
    await refusal(
      withTenant({ orgId: orgWithProject, principal: memberOf(orgWithProject) }, (tx) => tx.select().from(auditFinding))
    )
  ).toMatch(/permission denied for table audit_finding/)
  expect(await refusal(withPublicReader((tx) => tx.select().from(auditFinding)))).toMatch(
    /permission denied for table audit_finding/
  )
})
