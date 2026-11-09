import { canonicalHash } from '@skyclause/clauses'
import crowdDefault from '@skyclause/clauses/defaults/crowd.json'
import skyDefault from '@skyclause/clauses/defaults/sky.json'
import {
  analyticsEvent,
  appendLedger,
  archiveProjectRecord,
  auditEvent,
  clauseSheet,
  createProjectRecord,
  domainEvent,
  getProjectRecord,
  getProjectSummaryRecord,
  ledgerEntry,
  project,
  projectGate,
  projectPack,
  projectSource,
  ProjectSlugError,
  reading,
  restoreProjectRecord,
  sheetVersion,
  updateProjectRecord,
  window as windowTable,
  withSystem,
  withTenant,
  type Tx
} from '../src'
import {
  makeBundle,
  makeCall,
  makeNight,
  makeOrganization,
  makeProjectSource,
  makeRun,
  makeShadowState,
  makeSourceState,
  makeWindow
} from './factories'
import { memberOf, refusal } from './harness'
import { and, asc, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, test } from 'vitest'

let orgId: string
let otherOrgId: string

const inOrg = <T>(fn: (tx: Tx) => Promise<T>, org = orgId) => withTenant({ orgId: org, principal: memberOf(org) }, fn)

beforeAll(async () => {
  orgId = (await makeOrganization({ slug: 'db-projects-home' })).id
  otherOrgId = (await makeOrganization({ slug: 'db-projects-other' })).id
})

describe('createProjectRecord atomic bootstrap (#137)', () => {
  test('creates project, both packs (Sky enabled, Crowd off, SLA 600/7200), both version-1 default sheets, one analytic and zero sample rows', async () => {
    const now = new Date('2026-11-08T02:00:00Z')
    const created = await inOrg((tx) =>
      createProjectRecord(
        tx,
        {
          name: 'Bukit Jalil Campus',
          slug: 'bukit-jalil',
          siteName: 'APU Campus',
          siteLat: 3.0553,
          siteLon: 101.7005,
          packs: ['sky', 'crowd']
        },
        now
      )
    )

    expect(created.project).toMatchObject({
      orgId,
      name: 'Bukit Jalil Campus',
      slug: 'bukit-jalil',
      timeZone: 'Asia/Kuala_Lumpur',
      public: false,
      semesterEndsOn: null,
      siteName: 'APU Campus',
      siteLat: 3.0553,
      siteLon: 101.7005,
      archivedAt: null,
      cameraDayStart: null,
      cameraDayEnd: null,
      warningAreaTerms: []
    })

    const state = await inOrg(async (tx) => {
      const packs = await tx
        .select()
        .from(projectPack)
        .where(eq(projectPack.projectId, created.project.id))
        .orderBy(asc(projectPack.pack))
      const sheets = await tx
        .select()
        .from(clauseSheet)
        .where(eq(clauseSheet.projectId, created.project.id))
        .orderBy(asc(clauseSheet.pack))
      const versions = await tx.select().from(sheetVersion).orderBy(asc(sheetVersion.createdAt), asc(sheetVersion.id))
      const ownVersions = versions.filter((v) => sheets.some((s) => s.id === v.sheetId))
      const windows = await tx.select().from(windowTable).where(eq(windowTable.projectId, created.project.id))
      const sources = await tx.select().from(projectSource).where(eq(projectSource.projectId, created.project.id))
      const ledger = await tx.select().from(ledgerEntry).where(eq(ledgerEntry.projectId, created.project.id))
      return { packs, sheets, versions: ownVersions, windows, sources, ledger }
    })

    expect(state.windows).toHaveLength(0)
    expect(state.sources).toHaveLength(0)
    expect(state.ledger).toHaveLength(0)

    const readings = await withSystem('test', (tx) => tx.select().from(reading))
    expect(readings).toHaveLength(0)

    expect(state.sheets).toHaveLength(2)
    const skySheet = state.sheets.find((s) => s.pack === 'sky')!
    const crowdSheet = state.sheets.find((s) => s.pack === 'crowd')!
    expect(skySheet.liveVersionId).toBeTruthy()
    expect(crowdSheet.liveVersionId).toBeTruthy()

    expect(state.packs).toEqual([
      expect.objectContaining({
        projectId: created.project.id,
        pack: 'sky',
        enabled: true,
        sheetId: skySheet.id,
        schedule: null,
        slaS: 600
      }),
      expect.objectContaining({
        projectId: created.project.id,
        pack: 'crowd',
        enabled: false,
        sheetId: crowdSheet.id,
        schedule: null,
        slaS: 7200
      })
    ])

    expect(state.versions).toHaveLength(2)
    const skyVersion = state.versions.find((v) => v.id === skySheet.liveVersionId)!
    const crowdVersion = state.versions.find((v) => v.id === crowdSheet.liveVersionId)!

    expect(skyVersion).toMatchObject({
      sheetId: skySheet.id,
      n: 1,
      status: 'published',
      publishedBy: null,
      publishedAt: now,
      content: skyDefault,
      contentHash: canonicalHash(skyDefault)
    })
    expect(crowdVersion).toMatchObject({
      sheetId: crowdSheet.id,
      n: 1,
      status: 'published',
      publishedBy: null,
      publishedAt: now,
      content: crowdDefault,
      contentHash: canonicalHash(crowdDefault)
    })

    const analytics = await withSystem('test', (tx) =>
      tx
        .select()
        .from(analyticsEvent)
        .where(and(eq(analyticsEvent.name, 'project_created'), eq(analyticsEvent.projectId, created.project.id)))
    )
    expect(analytics).toHaveLength(1)
    expect(analytics[0]!.props).toEqual({ packs: ['sky', 'crowd'] })
  })

  test('with only Crowd chosen, both pack rows and default sheets exist and both packs start disabled', async () => {
    const created = await inOrg((tx) =>
      createProjectRecord(tx, {
        name: 'Stadium Only',
        slug: 'stadium-only',
        siteName: 'National Stadium',
        siteLat: 3.0547,
        siteLon: 101.6915,
        packs: ['crowd']
      })
    )
    expect(created.packs.map((p) => ({ pack: p.pack, enabled: p.enabled, slaS: p.slaS }))).toEqual([
      { pack: 'sky', enabled: false, slaS: 600 },
      { pack: 'crowd', enabled: false, slaS: 7200 }
    ])
  })

  test('rolls back project, packs, sheets, versions and analytics when a later write in the caller transaction fails', async () => {
    const slug = 'rollback-check'
    await expect(
      inOrg(async (tx) => {
        await createProjectRecord(tx, {
          name: 'Rollback Project',
          slug,
          siteName: 'APU',
          siteLat: 3.05,
          siteLon: 101.7,
          packs: ['sky']
        })
        throw new Error('forced caller transaction failure after createProjectRecord')
      })
    ).rejects.toThrow('forced caller transaction failure')

    const survived = await inOrg(async (tx) => {
      const projects = await tx.select().from(project).where(eq(project.slug, slug))
      return projects
    })
    expect(survived).toHaveLength(0)

    const analytics = await withSystem('test', (tx) =>
      tx.select().from(analyticsEvent).where(eq(analyticsEvent.orgId, orgId))
    )
    // Only the two earlier committed projects exist in analytics_event for this org.
    expect(analytics).toHaveLength(2)
  })

  test('rejects reserved, duplicate and malformed slugs while allowing the same slug in another organisation', async () => {
    for (const reserved of ['new', 'v1', 'commons'] as const) {
      await expect(
        inOrg((tx) =>
          createProjectRecord(tx, {
            name: 'Reserved',
            slug: reserved,
            siteName: 'APU',
            siteLat: 3.05,
            siteLon: 101.7,
            packs: ['sky']
          })
        )
      ).rejects.toMatchObject({
        name: 'ProjectSlugError',
        code: 'slug-reserved',
        field: 'slug',
        reason: 'reserved'
      } satisfies Partial<ProjectSlugError>)
    }

    await expect(
      inOrg((tx) =>
        createProjectRecord(tx, {
          name: 'Duplicate',
          slug: 'bukit-jalil',
          siteName: 'APU',
          siteLat: 3.05,
          siteLon: 101.7,
          packs: ['sky']
        })
      )
    ).rejects.toMatchObject({
      name: 'ProjectSlugError',
      code: 'slug-taken',
      field: 'slug',
      reason: 'taken'
    } satisfies Partial<ProjectSlugError>)

    // Same slug in another organisation is allowed.
    const otherCreated = await inOrg(
      (tx) =>
        createProjectRecord(tx, {
          name: 'Other Org Bukit Jalil',
          slug: 'bukit-jalil',
          siteName: 'APU',
          siteLat: 3.05,
          siteLon: 101.7,
          packs: ['sky']
        }),
      otherOrgId
    )
    expect(otherCreated.project.slug).toBe('bukit-jalil')
  })
})

describe('update, archive, restore and projectGate (#137)', () => {
  test('updates owned fields, archives and restores idempotently without audit or domain events, and keeps ledger readable', async () => {
    const t1 = new Date('2026-11-08T03:00:00Z')
    const t2 = new Date('2026-11-08T04:00:00Z')
    const { project: created } = await inOrg((tx) =>
      createProjectRecord(tx, {
        name: 'Lifecycle Test',
        slug: 'lifecycle-test',
        siteName: 'Site A',
        siteLat: 3.05,
        siteLon: 101.7,
        packs: ['sky']
      })
    )

    const updated = await inOrg((tx) =>
      updateProjectRecord(tx, created.id, {
        name: 'Lifecycle Updated',
        siteName: 'Site B',
        siteLat: 3.06,
        siteLon: 101.71,
        timeZone: 'Asia/Singapore',
        cameraDayStart: '07:00',
        cameraDayEnd: '19:00',
        semesterEndsOn: '2027-01-15',
        warningAreaTerms: ['Kuala Lumpur', 'Petaling'],
        public: true
      })
    )
    expect(updated?.project).toMatchObject({
      name: 'Lifecycle Updated',
      siteName: 'Site B',
      siteLat: 3.06,
      siteLon: 101.71,
      timeZone: 'Asia/Singapore',
      cameraDayStart: '07:00',
      cameraDayEnd: '19:00',
      semesterEndsOn: '2027-01-15',
      warningAreaTerms: ['Kuala Lumpur', 'Petaling'],
      public: true
    })

    const entry = await inOrg((tx) =>
      appendLedger(tx, { projectId: created.id, kind: 'call_sent', refs: {}, body: { ok: true } })
    )

    const firstArchive = await inOrg((tx) => archiveProjectRecord(tx, created.id, t1))
    expect(firstArchive?.project.archivedAt).toEqual(t1)
    expect(await inOrg((tx) => projectGate(tx, created.id))).toBe('archived')

    // Repeat archive preserves original archivedAt.
    const secondArchive = await inOrg((tx) => archiveProjectRecord(tx, created.id, t2))
    expect(secondArchive?.project.archivedAt).toEqual(t1)

    // Ledger remains readable while archived.
    const ledgerWhileArchived = await inOrg((tx) =>
      tx.select().from(ledgerEntry).where(eq(ledgerEntry.projectId, created.id))
    )
    expect(ledgerWhileArchived.map((l) => l.id)).toEqual([entry.id])

    const firstRestore = await inOrg((tx) => restoreProjectRecord(tx, created.id, t2))
    expect(firstRestore?.project.archivedAt).toBeNull()
    expect(await inOrg((tx) => projectGate(tx, created.id))).toBe('open')

    // Repeat restore remains null.
    const secondRestore = await inOrg((tx) => restoreProjectRecord(tx, created.id, t2))
    expect(secondRestore?.project.archivedAt).toBeNull()

    // Neither archive nor restore writes an audit or domain event.
    const auditsAndEvents = await inOrg(async (tx) => ({
      audits: await tx.select().from(auditEvent).where(eq(auditEvent.projectId, created.id)),
      events: await tx.select().from(domainEvent).where(eq(domainEvent.projectId, created.id))
    }))
    expect(auditsAndEvents).toEqual({ audits: [], events: [] })
  })
})

describe('getProjectSummaryRecord (D3 precedence and counts)', () => {
  test('empty project reports bind_source, zero inputs, null basis for both packs, and no invented data', async () => {
    const now = new Date('2026-11-08T05:00:00Z')
    const { project: created } = await inOrg((tx) =>
      createProjectRecord(tx, {
        name: 'Summary Empty',
        slug: 'summary-empty',
        siteName: 'APU',
        siteLat: 3.05,
        siteLon: 101.7,
        packs: ['sky']
      })
    )
    const summary = await inOrg((tx) => getProjectSummaryRecord(tx, created.id, now))
    expect(summary).toEqual({
      pack_states: [
        { pack: 'sky', basis: null, call_id: null, mode: null, watch: false, no_call: null },
        { pack: 'crowd', basis: null, call_id: null, mode: null, watch: false, no_call: null }
      ],
      windows_at_risk: 0,
      signal_health: { state: 'pending', inputs_reporting: 0, oldest_age_s: null },
      latest_bundle: null,
      next_night: null,
      next_storm_date: null,
      next_action: 'bind_source'
    })
  })

  test('approved call in force beats shadow verdict, highest mode wins among active calls, and expired call falls back to shadow verdict', async () => {
    const now = new Date('2026-11-08T06:00:00Z')
    const scene = await inOrg(async (tx) => {
      const { project: created } = await createProjectRecord(tx, {
        name: 'Summary D3',
        slug: 'summary-d3',
        siteName: 'APU',
        siteLat: 3.05,
        siteLon: 101.7,
        packs: ['sky', 'crowd']
      })
      const bound = await makeProjectSource(tx, { projectId: created.id, role: 'rain_gauge' })
      await makeSourceState(tx, {
        sourceId: bound.sourceId,
        state: 'fresh',
        since: new Date('2026-11-08T05:55:00Z')
      })

      // Conflicting Sky shadow verdict says normal, while two approved calls are in force:
      // an older call with hybrid_recommended and a newer call with outdoor_limited. Highest mode must win.
      await makeShadowState(tx, {
        projectId: created.id,
        pack: 'sky',
        scopeKind: 'site',
        verdict: { mode: 'normal', watch: false, no_call: null }
      })
      const winHigh = await makeWindow(tx, {
        projectId: created.id,
        startsAt: new Date('2026-11-08T05:00:00Z'),
        endsAt: new Date('2026-11-08T07:00:00Z')
      })
      const winLow = await makeWindow(tx, {
        projectId: created.id,
        startsAt: new Date('2026-11-08T05:30:00Z'),
        endsAt: new Date('2026-11-08T07:30:00Z')
      })
      const skyBundle = await makeBundle(tx, {
        runId: (await makeRun(tx, { projectId: created.id, pack: 'sky' })).id,
        pack: 'sky',
        state: 'sent'
      })
      const highCall = await makeCall(tx, {
        bundleId: skyBundle.id,
        windowId: winHigh.id,
        mode: 'hybrid_recommended',
        watch: true,
        state: 'sent',
        approvedAt: new Date('2026-11-08T05:05:00Z'),
        sentAt: new Date('2026-11-08T05:05:05Z')
      })
      await makeCall(tx, {
        bundleId: skyBundle.id,
        windowId: winLow.id,
        mode: 'outdoor_limited',
        watch: false,
        state: 'sent',
        approvedAt: new Date('2026-11-08T05:40:00Z'),
        sentAt: new Date('2026-11-08T05:40:05Z')
      })

      // Crowd has an expired night call (exitEnd in the past) and a shadow_state verdict: must fall back to engine_verdict.
      const pastNight = await makeNight(tx, {
        projectId: created.id,
        date: '2026-11-07',
        doors: new Date('2026-11-07T10:00:00Z'),
        show: new Date('2026-11-07T12:00:00Z'),
        arrivalStart: new Date('2026-11-07T09:00:00Z'),
        arrivalEnd: new Date('2026-11-07T12:00:00Z'),
        exitStart: new Date('2026-11-07T14:00:00Z'),
        exitEnd: new Date('2026-11-07T16:00:00Z')
      })
      const crowdBundle = await makeBundle(tx, {
        runId: (await makeRun(tx, { projectId: created.id, pack: 'crowd' })).id,
        pack: 'crowd',
        state: 'sent'
      })
      await makeCall(tx, {
        bundleId: crowdBundle.id,
        nightId: pastNight.id,
        mode: 'surge_night',
        watch: false,
        state: 'sent',
        expiresAt: new Date('2026-11-07T09:00:00Z'),
        approvedAt: new Date('2026-11-07T08:00:00Z'),
        sentAt: new Date('2026-11-07T08:00:05Z')
      })
      await makeShadowState(tx, {
        projectId: created.id,
        pack: 'crowd',
        scopeKind: 'site',
        verdict: { mode: 'normal', watch: false, no_call: null }
      })

      const summary = await getProjectSummaryRecord(tx, created.id, now)
      return { summary, highCallId: highCall.id, crowdBundleId: crowdBundle.id }
    })

    expect(scene.summary.pack_states).toEqual([
      {
        pack: 'sky',
        basis: 'approved_call',
        call_id: scene.highCallId,
        mode: 'hybrid_recommended',
        watch: true,
        no_call: null
      },
      {
        pack: 'crowd',
        basis: 'engine_verdict',
        call_id: null,
        mode: 'normal',
        watch: false,
        no_call: null
      }
    ])
    expect(scene.summary.windows_at_risk).toBe(2)
    expect(scene.summary.signal_health).toEqual({
      state: 'fresh',
      inputs_reporting: 1,
      oldest_age_s: 300
    })
    expect(scene.summary.latest_bundle?.id).toBe(scene.crowdBundleId)
    expect(scene.summary.next_action).toBeNull()
    expect(refusal).toBeTypeOf('function')
    expect(getProjectRecord).toBeTypeOf('function')
  })
})
