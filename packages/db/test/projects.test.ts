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
  makePoll,
  makeProjectSource,
  makeReading,
  makeRun,
  makeShadowState,
  makeSource,
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

describe('supported project time zones', () => {
  test('rejects unsupported create/update zones before any write, even if the caller catches the refusal', async () => {
    await inOrg(async (tx) => {
      await expect(
        createProjectRecord(tx, {
          name: 'Invalid zone',
          slug: 'invalid-zone-db',
          siteName: 'APU',
          siteLat: 3.05,
          siteLon: 101.7,
          packs: ['sky'],
          timeZone: 'not-a-time-zone'
        })
      ).rejects.toMatchObject({ name: 'ProjectTimeZoneError', field: 'time_zone' })
      expect(await tx.select().from(project).where(eq(project.slug, 'invalid-zone-db'))).toEqual([])
      const { project: created } = await createProjectRecord(tx, {
        name: 'Valid zone',
        slug: 'valid-zone-db',
        siteName: 'APU',
        siteLat: 3.05,
        siteLon: 101.7,
        packs: ['sky'],
        timeZone: 'America/New_York'
      })
      await expect(
        updateProjectRecord(tx, created.id, { name: 'Must not persist', timeZone: 'not-a-time-zone' })
      ).rejects.toMatchObject({ name: 'ProjectTimeZoneError', field: 'time_zone' })
      expect((await getProjectRecord(tx, created.id))?.project).toEqual(created)
      expect((await getProjectSummaryRecord(tx, created.id)).next_action).toBe('bind_source')
    })
  })

  test('invalid pre-existing stored zone surfaces an error without inventing a replacement', async () => {
    await expect(
      inOrg(async (tx) => {
        const { project: created } = await createProjectRecord(tx, {
          name: 'Corrupt stored zone',
          slug: 'corrupt-stored-zone',
          siteName: 'APU',
          siteLat: 3.05,
          siteLon: 101.7,
          packs: ['sky']
        })
        await tx.update(project).set({ timeZone: 'not-a-time-zone' }).where(eq(project.id, created.id))
        return getProjectSummaryRecord(tx, created.id)
      })
    ).rejects.toMatchObject({ cause: { code: '22023' } })
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
        since: new Date('2026-11-01T00:00:00Z')
      })
      await makeReading(tx, {
        sourceId: bound.sourceId,
        observedAt: new Date('2026-11-08T05:55:00Z'),
        value: 12.5
      })

      // Conflicting Sky shadow verdict says normal, while two approved calls are in force:
      // an older call with hybrid_recommended and a newer call with outdoor_limited. Highest mode must win.
      await makeShadowState(tx, {
        projectId: created.id,
        pack: 'sky',
        scopeKind: 'site',
        verdict: {
          scope: { kind: 'site', id: null },
          pack: 'sky',
          mode: 'normal',
          watch: false,
          no_call: null,
          recommendations: [],
          clauses: [],
          open_from: null
        }
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
        shadow: {
          scope: { kind: 'window', id: winHigh.id },
          pack: 'sky',
          mode: 'hybrid_recommended',
          watch: true,
          no_call: null,
          recommendations: [],
          clauses: [],
          open_from: null
        },
        approvedAt: new Date('2026-11-08T05:05:00Z'),
        sentAt: new Date('2026-11-08T05:05:05Z')
      })
      await makeCall(tx, {
        bundleId: skyBundle.id,
        windowId: winLow.id,
        mode: 'outdoor_limited',
        watch: false,
        state: 'sent',
        shadow: {
          scope: { kind: 'window', id: winLow.id },
          pack: 'sky',
          mode: 'outdoor_limited',
          watch: false,
          no_call: null,
          recommendations: [],
          clauses: [],
          open_from: null
        },
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
        shadow: {
          scope: { kind: 'night', id: pastNight.id },
          pack: 'crowd',
          mode: 'surge_night',
          watch: false,
          no_call: null,
          recommendations: ['leave_before_doors'],
          clauses: [],
          open_from: null
        },
        expiresAt: new Date('2026-11-07T09:00:00Z'),
        approvedAt: new Date('2026-11-07T08:00:00Z'),
        sentAt: new Date('2026-11-07T08:00:05Z')
      })
      await makeShadowState(tx, {
        projectId: created.id,
        pack: 'crowd',
        scopeKind: 'site',
        verdict: {
          scope: { kind: 'site', id: null },
          pack: 'crowd',
          mode: 'normal',
          watch: false,
          no_call: null,
          recommendations: [],
          clauses: [],
          open_from: null
        }
      })

      const summary = await getProjectSummaryRecord(tx, created.id, now)
      return { summary, highCallId: highCall.id, crowdBundleId: crowdBundle.id, pastNightId: pastNight.id }
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
    expect(scene.summary.latest_bundle?.calls[0]?.shadow).toMatchObject({
      scope: { kind: 'night', id: scene.pastNightId },
      pack: 'crowd',
      mode: 'surge_night'
    })
    expect(scene.summary.next_action).toBeNull()
    expect(refusal).toBeTypeOf('function')
    expect(getProjectRecord).toBeTypeOf('function')
  })

  test.each([true, false])(
    'post-window span keeps current blockers and engine basis through span end (approved=%s)',
    async (approved) => {
      await inOrg(async (tx) => {
        const { project: created } = await createProjectRecord(tx, {
          name: 'Post-window span',
          slug: approved ? 'span-approved' : 'span-engine',
          siteName: 'APU',
          siteLat: 3.05,
          siteLon: 101.7,
          packs: ['sky']
        })
        const win = await makeWindow(tx, {
          projectId: created.id,
          startsAt: new Date('2026-11-08T06:00:00Z'),
          endsAt: new Date('2026-11-08T07:00:00Z')
        })
        const gauge = await makeSource(tx)
        await makeProjectSource(tx, { projectId: created.id, sourceId: gauge.id, role: 'rain_gauge' })
        await makeSourceState(tx, { sourceId: gauge.id, state: 'error', since: new Date('2026-11-08T07:15:00Z') })
        const scope = { kind: 'window', id: win.id }
        const span = { from: '2026-11-08T06:30:00Z', to: '2026-11-08T08:00:00Z', complete: true }
        const blocker = {
          name: 'w.rain_max_60m_mm',
          source_id: gauge.id,
          state: 'error',
          since: '2026-11-08T07:15:00Z'
        }
        let callId: string | null = null
        if (approved) {
          const b = await makeBundle(tx, {
            runId: (await makeRun(tx, { projectId: created.id, pack: 'sky' })).id,
            pack: 'sky',
            state: 'sent'
          })
          callId = (
            await makeCall(tx, {
              bundleId: b.id,
              windowId: win.id,
              mode: 'normal',
              state: 'sent',
              approvedAt: new Date('2026-11-08T06:45:00Z'),
              shadow: {
                scope,
                pack: 'sky',
                mode: 'normal',
                watch: false,
                no_call: null,
                recommendations: [],
                clauses: [{ key: 'storm_confirmed', result: 'not_fired', blocked_by: [], inputs: [], span }],
                open_from: null
              }
            })
          ).id
        }
        await makeShadowState(tx, {
          projectId: created.id,
          pack: 'sky',
          scopeKind: 'window',
          scopeId: win.id,
          verdict: {
            scope,
            pack: 'sky',
            mode: 'outdoor_limited',
            watch: false,
            no_call: { inputs: [blocker] },
            recommendations: [],
            clauses: [{ key: 'storm_confirmed', result: 'blocked', blocked_by: [blocker], inputs: [], span }],
            open_from: null
          }
        })
        const open = await getProjectSummaryRecord(tx, created.id, new Date('2026-11-08T07:30:00Z'))
        expect(open.pack_states[0]).toEqual({
          pack: 'sky',
          basis: approved ? 'approved_call' : 'engine_verdict',
          call_id: callId,
          mode: approved ? 'normal' : 'outdoor_limited',
          watch: false,
          no_call: { inputs: [blocker] }
        })
        expect(open.windows_at_risk).toBe(0)
        const ended = await getProjectSummaryRecord(tx, created.id, new Date('2026-11-08T08:00:00Z'))
        expect(ended.pack_states[0]).toEqual({
          pack: 'sky',
          basis: null,
          call_id: null,
          mode: null,
          watch: false,
          no_call: null
        })
        expect(ended.windows_at_risk).toBe(0)
      })
    }
  )

  test('windows_at_risk restricts to today in the project local time zone (including non-MYT) and respects approved Normal over risky shadow unless No call applies', async () => {
    // 2026-11-08T22:30:00Z is 2026-11-08 17:30:00 in America/New_York (UTC-5), where local today ends at 2026-11-09T05:00:00Z.
    const now = new Date('2026-11-08T22:30:00Z')
    const result = await inOrg(async (tx) => {
      const { project: nyProject } = await createProjectRecord(tx, {
        name: 'NY Campus',
        slug: 'ny-campus',
        siteName: 'NY Site',
        siteLat: 40.7128,
        siteLon: -74.006,
        timeZone: 'America/New_York',
        packs: ['sky']
      })

      // Window 1: today in NY (18:00-20:00 EST -> 23:00Z to 01:00Z next UTC day, still before 05:00Z NY midnight), risky shadow.
      const todayRisky = await makeWindow(tx, {
        projectId: nyProject.id,
        startsAt: new Date('2026-11-08T23:00:00Z'),
        endsAt: new Date('2026-11-09T01:00:00Z')
      })
      await makeShadowState(tx, {
        projectId: nyProject.id,
        pack: 'sky',
        scopeKind: 'window',
        scopeId: todayRisky.id,
        verdict: {
          scope: { kind: 'window', id: todayRisky.id },
          pack: 'sky',
          mode: 'outdoor_limited',
          watch: false,
          no_call: null,
          recommendations: [],
          clauses: [],
          open_from: null
        }
      })

      // Window 2: tomorrow in NY (starts 2026-11-09T13:00:00Z = 08:00 EST tomorrow), risky shadow -> must NOT count today.
      const tomorrowRisky = await makeWindow(tx, {
        projectId: nyProject.id,
        startsAt: new Date('2026-11-09T13:00:00Z'),
        endsAt: new Date('2026-11-09T15:00:00Z')
      })
      await makeShadowState(tx, {
        projectId: nyProject.id,
        pack: 'sky',
        scopeKind: 'window',
        scopeId: tomorrowRisky.id,
        verdict: {
          scope: { kind: 'window', id: tomorrowRisky.id },
          pack: 'sky',
          mode: 'hybrid_recommended',
          watch: true,
          no_call: null,
          recommendations: [],
          clauses: [],
          open_from: null
        }
      })

      // Window 3: today in NY, has an approved Normal call in force AND a conflicting outdoor_limited shadow with no blockers -> approved Normal wins, NOT at risk.
      const todayApprovedNormal = await makeWindow(tx, {
        projectId: nyProject.id,
        startsAt: new Date('2026-11-08T22:00:00Z'),
        endsAt: new Date('2026-11-09T00:00:00Z')
      })
      const b = await makeBundle(tx, {
        runId: (await makeRun(tx, { projectId: nyProject.id, pack: 'sky' })).id,
        pack: 'sky',
        state: 'sent'
      })
      await makeCall(tx, {
        bundleId: b.id,
        windowId: todayApprovedNormal.id,
        mode: 'normal',
        watch: false,
        state: 'sent',
        shadow: {
          scope: { kind: 'window', id: todayApprovedNormal.id },
          pack: 'sky',
          mode: 'normal',
          watch: false,
          no_call: null,
          recommendations: [],
          clauses: [],
          open_from: null
        },
        approvedAt: new Date('2026-11-08T22:05:00Z'),
        sentAt: new Date('2026-11-08T22:05:05Z')
      })
      await makeShadowState(tx, {
        projectId: nyProject.id,
        pack: 'sky',
        scopeKind: 'window',
        scopeId: todayApprovedNormal.id,
        verdict: {
          scope: { kind: 'window', id: todayApprovedNormal.id },
          pack: 'sky',
          mode: 'outdoor_limited',
          watch: true,
          no_call: null,
          recommendations: [],
          clauses: [],
          open_from: null
        }
      })

      // A still-open window crossing into today counts; ended/cancelled windows and tomorrow's midnight do not.
      for (const [startsAt, endsAt, cancelledAt] of [
        ['2026-11-08T04:00:00Z', '2026-11-08T23:00:00Z', null],
        ['2026-11-08T18:00:00Z', '2026-11-08T22:30:00Z', null],
        ['2026-11-08T23:00:00Z', '2026-11-09T01:00:00Z', '2026-11-08T22:00:00Z'],
        ['2026-11-09T05:00:00Z', '2026-11-09T06:00:00Z', null]
      ]) {
        const w = await makeWindow(tx, {
          projectId: nyProject.id,
          startsAt: new Date(startsAt!),
          endsAt: new Date(endsAt!),
          cancelledAt: cancelledAt ? new Date(cancelledAt) : null
        })
        await makeShadowState(tx, {
          projectId: nyProject.id,
          pack: 'sky',
          scopeKind: 'window',
          scopeId: w.id,
          verdict: {
            scope: { kind: 'window', id: w.id },
            pack: 'sky',
            mode: 'outdoor_limited',
            watch: false,
            no_call: null,
            recommendations: [],
            clauses: [],
            open_from: null
          }
        })
      }
      return getProjectSummaryRecord(tx, nyProject.id, now)
    })

    expect(result.windows_at_risk).toBe(2)
  })

  test('signal_health oldest_age_s uses newest reading for observed sources and last ok/unchanged poll for polled sources, returning null when provenance is absent', async () => {
    const now = new Date('2026-11-09T06:00:00Z')
    const { withProvenance, withoutProvenance } = await inOrg(async (tx) => {
      const { project: p1 } = await createProjectRecord(tx, {
        name: 'Signal Provenance',
        slug: 'signal-provenance',
        siteName: 'APU',
        siteLat: 3.05,
        siteLon: 101.7,
        packs: ['sky']
      })
      const obsSource = await makeSource(tx, { kind: 'jps_rain', freshness: 'observed' })
      const polledSource = await makeSource(tx, { kind: 'met_warning', freshness: 'polled' })
      await makeProjectSource(tx, { projectId: p1.id, sourceId: obsSource.id, role: 'rain_gauge' })
      await makeProjectSource(tx, { projectId: p1.id, sourceId: polledSource.id, role: 'warnings' })

      // Both sources have been continuously fresh since 1 November (8 days ago), so state.since is 712800s old.
      await makeSourceState(tx, {
        sourceId: obsSource.id,
        state: 'fresh',
        since: new Date('2026-11-01T00:00:00Z')
      })
      await makeSourceState(tx, {
        sourceId: polledSource.id,
        state: 'fresh',
        since: new Date('2026-11-01T00:00:00Z')
      })

      await makeReading(tx, { sourceId: obsSource.id, observedAt: new Date('2026-11-09T05:00:00Z'), value: 0 })
      await makePoll(tx, { sourceId: polledSource.id, startedAt: new Date('2026-11-09T05:00:00Z'), outcome: 'ok' })
      await makeReading(tx, { sourceId: obsSource.id, observedAt: new Date('2026-11-09T07:00:00Z'), value: 0 })
      await makePoll(tx, { sourceId: polledSource.id, startedAt: new Date('2026-11-09T07:00:00Z'), outcome: 'ok' })
      // Observed source has a reading 180s ago; polled source has an unchanged poll 420s ago and a failed poll 60s ago.
      await makeReading(tx, {
        sourceId: obsSource.id,
        observedAt: new Date('2026-11-09T05:57:00Z'),
        value: 0
      })
      await makePoll(tx, {
        sourceId: polledSource.id,
        startedAt: new Date('2026-11-09T05:53:00Z'),
        outcome: 'unchanged',
        httpStatus: 304
      })
      await makePoll(tx, {
        sourceId: polledSource.id,
        startedAt: new Date('2026-11-09T05:59:00Z'),
        outcome: 'error',
        httpStatus: 503
      })

      const { project: p2 } = await createProjectRecord(tx, {
        name: 'Signal Unknown Age',
        slug: 'signal-unknown-age',
        siteName: 'APU',
        siteLat: 3.05,
        siteLon: 101.7,
        packs: ['sky']
      })
      const noDataObs = await makeSource(tx, { kind: 'jps_rain', freshness: 'observed' })
      await makeProjectSource(tx, { projectId: p2.id, sourceId: noDataObs.id, role: 'rain_gauge' })
      await makeSourceState(tx, {
        sourceId: noDataObs.id,
        state: 'fresh',
        since: new Date('2026-11-01T00:00:00Z')
      })

      return {
        withProvenance: await getProjectSummaryRecord(tx, p1.id, now),
        withoutProvenance: await getProjectSummaryRecord(tx, p2.id, now)
      }
    })

    expect(withProvenance.signal_health).toEqual({
      state: 'fresh',
      inputs_reporting: 2,
      oldest_age_s: 420
    })
    expect(withoutProvenance.signal_health).toEqual({
      state: 'fresh',
      inputs_reporting: 1,
      oldest_age_s: null
    })
  })

  test('D3 pack summary retains approved call mode while overlaying current required-input no_call blockers, excluding not_open and deduplicating', async () => {
    const now = new Date('2026-11-08T06:00:00Z')
    const { summary, callId, gaugeId } = await inOrg(async (tx) => {
      const { project: created } = await createProjectRecord(tx, {
        name: 'Overlay D3',
        slug: 'overlay-d3',
        siteName: 'APU',
        siteLat: 3.05,
        siteLon: 101.7,
        packs: ['sky']
      })
      const gauge = await makeSource(tx, { kind: 'jps_rain', freshness: 'observed' })
      await makeProjectSource(tx, { projectId: created.id, sourceId: gauge.id, role: 'rain_gauge' })
      await makeSourceState(tx, {
        sourceId: gauge.id,
        state: 'error',
        since: new Date('2026-11-08T05:50:00Z')
      })

      const win = await makeWindow(tx, {
        projectId: created.id,
        startsAt: new Date('2026-11-08T05:00:00Z'),
        endsAt: new Date('2026-11-08T07:00:00Z')
      })
      const skyBundle = await makeBundle(tx, {
        runId: (await makeRun(tx, { projectId: created.id, pack: 'sky' })).id,
        pack: 'sky',
        state: 'sent'
      })
      const normalCall = await makeCall(tx, {
        bundleId: skyBundle.id,
        windowId: win.id,
        mode: 'normal',
        watch: false,
        state: 'sent',
        shadow: {
          scope: { kind: 'window', id: win.id },
          pack: 'sky',
          mode: 'normal',
          watch: false,
          no_call: null,
          recommendations: [],
          clauses: [],
          open_from: null
        },
        approvedAt: new Date('2026-11-08T05:10:00Z'),
        sentAt: new Date('2026-11-08T05:10:05Z')
      })

      const rainBlocker = {
        name: 'w.rain_max_60m_mm',
        source_id: gauge.id,
        state: 'stale' as const,
        since: '2026-11-08T05:40:00Z'
      }
      const notOpenBlocker = {
        name: 'w.future_only_mm',
        source_id: gauge.id,
        state: 'pending' as const,
        since: '2026-11-08T05:50:00Z'
      }

      // Newer window shadow verdict has rainBlocker duplicated across two blocked clauses and a not_open clause blocker.
      await makeShadowState(tx, {
        projectId: created.id,
        pack: 'sky',
        scopeKind: 'window',
        scopeId: win.id,
        verdict: {
          scope: { kind: 'window', id: win.id },
          pack: 'sky',
          mode: 'commute_disruption',
          watch: false,
          no_call: { inputs: [rainBlocker, rainBlocker, notOpenBlocker] },
          recommendations: [],
          clauses: [
            {
              key: 'storm_confirmed',
              result: 'blocked',
              blocked_by: [rainBlocker],
              inputs: []
            },
            {
              key: 'flash_flood_risk',
              result: 'blocked',
              blocked_by: [rainBlocker],
              inputs: []
            },
            {
              key: 'future_clause',
              result: 'not_open',
              blocked_by: [notOpenBlocker],
              inputs: []
            }
          ],
          open_from: null
        }
      })

      return {
        summary: await getProjectSummaryRecord(tx, created.id, now),
        callId: normalCall.id,
        gaugeId: gauge.id
      }
    })

    expect(summary.pack_states[0]).toEqual({
      pack: 'sky',
      basis: 'approved_call',
      call_id: callId,
      mode: 'normal',
      watch: false,
      no_call: {
        inputs: [
          {
            name: 'w.rain_max_60m_mm',
            source_id: gaugeId,
            state: 'error',
            since: '2026-11-08T05:50:00Z'
          }
        ]
      }
    })
    // Although the approved mode is Normal, the window has a current required-input No call failure, so it counts at risk.
    expect(summary.windows_at_risk).toBe(1)
  })

  test('keeps a required derived-input blocker when its underlying source is fresh, and rejects invalid current verdicts', async () => {
    await inOrg(async (tx) => {
      const { project: created } = await createProjectRecord(tx, {
        name: 'Derived Blocker',
        slug: 'derived-blocker',
        siteName: 'APU',
        siteLat: 3.05,
        siteLon: 101.7,
        packs: ['sky']
      })
      const gauge = await makeSource(tx)
      await makeProjectSource(tx, { projectId: created.id, sourceId: gauge.id, role: 'rain_gauge' })
      await makeSourceState(tx, { sourceId: gauge.id, state: 'fresh', since: new Date('2026-11-08T05:50:00Z') })
      const blocker = {
        name: 'w.rain_max_60m_mm',
        source_id: gauge.id,
        state: 'pending',
        since: '2026-11-08T05:00:00Z'
      }
      await makeShadowState(tx, {
        projectId: created.id,
        pack: 'sky',
        scopeKind: 'site',
        verdict: {
          scope: { kind: 'site', id: null },
          pack: 'sky',
          mode: null,
          watch: false,
          no_call: { inputs: [blocker] },
          recommendations: [],
          clauses: [{ key: 'coverage', result: 'blocked', blocked_by: [blocker], inputs: [] }],
          open_from: null
        }
      })
      expect(
        (await getProjectSummaryRecord(tx, created.id, new Date('2026-11-08T06:00:00Z'))).pack_states[0]?.no_call
      ).toEqual({ inputs: [blocker] })
    })
    await expect(
      inOrg(async (tx) => {
        const { project: created } = await createProjectRecord(tx, {
          name: 'Invalid Current Verdict',
          slug: 'invalid-current-verdict',
          siteName: 'APU',
          siteLat: 3.05,
          siteLon: 101.7,
          packs: ['sky']
        })
        await makeShadowState(tx, {
          projectId: created.id,
          pack: 'sky',
          scopeKind: 'site',
          verdict: { mode: 'normal', watch: false }
        })
        return getProjectSummaryRecord(tx, created.id)
      })
    ).rejects.toThrow('Invalid persisted shadow verdict')
  })

  test('populates next_storm_date from a fresh bound met_forecast source with an upcoming storm forecast_day reading', async () => {
    const now = new Date('2026-11-08T06:00:00Z')
    const { withUpcomingStorm, withStaleForecast } = await inOrg(async (tx) => {
      const { project: p1 } = await createProjectRecord(tx, {
        name: 'Forecast Storm',
        slug: 'forecast-storm',
        siteName: 'APU',
        siteLat: 3.05,
        siteLon: 101.7,
        packs: ['sky']
      })
      const metForecast = await makeSource(tx, { kind: 'met_forecast', freshness: 'polled' })
      await makeProjectSource(tx, { projectId: p1.id, sourceId: metForecast.id, role: 'met_forecast' })
      await makeSourceState(tx, {
        sourceId: metForecast.id,
        state: 'fresh',
        since: new Date('2026-11-08T05:00:00Z')
      })
      await makePoll(tx, {
        sourceId: metForecast.id,
        startedAt: new Date('2026-11-08T05:50:00Z'),
        outcome: 'ok',
        httpStatus: 200
      })

      // Past storm date (yesterday) must be ignored.
      await makeReading(tx, {
        sourceId: metForecast.id,
        metric: 'forecast_day',
        unit: null,
        value: null,
        itemKey: '2026-11-07',
        observedAt: new Date('2026-11-07T00:00:00Z'),
        valueJson: {
          date: '2026-11-07',
          afternoon_forecast: 'Ribut petir di satu dua tempat',
          gloss_en: { afternoon_forecast: 'Thunderstorms in one or two places' }
        }
      })
      // Today has fair weather.
      await makeReading(tx, {
        sourceId: metForecast.id,
        metric: 'forecast_day',
        unit: null,
        value: null,
        itemKey: '2026-11-08',
        observedAt: new Date('2026-11-08T05:50:00Z'),
        valueJson: {
          date: '2026-11-08',
          afternoon_forecast: 'Tiada hujan',
          gloss_en: { afternoon_forecast: 'No rain' }
        }
      })
      for (const [revision, text] of [
        [0, 'Ribut petir di beberapa tempat'],
        [1, 'Tiada hujan']
      ] as const) {
        await makeReading(tx, {
          sourceId: metForecast.id,
          metric: 'forecast_day',
          unit: null,
          value: null,
          itemKey: '2026-11-09',
          observedAt: new Date('2026-11-08T05:50:00Z'),
          revision,
          valueJson: { date: '2026-11-09', afternoon_forecast: text, gloss_en: {} }
        })
      }
      // 2026-11-10 has an afternoon thunderstorm forecast.
      await makeReading(tx, {
        sourceId: metForecast.id,
        metric: 'forecast_day',
        unit: null,
        value: null,
        itemKey: '2026-11-10',
        observedAt: new Date('2026-11-08T05:50:00Z'),
        valueJson: {
          date: '2026-11-10',
          afternoon_forecast: 'Ribut petir di beberapa tempat',
          gloss_en: { afternoon_forecast: 'Thunderstorms in several places' }
        }
      })

      const { project: p2 } = await createProjectRecord(tx, {
        name: 'Forecast Stale',
        slug: 'forecast-stale',
        siteName: 'APU',
        siteLat: 3.05,
        siteLon: 101.7,
        packs: ['sky']
      })
      const staleForecast = await makeSource(tx, { kind: 'met_forecast', freshness: 'polled' })
      await makeProjectSource(tx, { projectId: p2.id, sourceId: staleForecast.id, role: 'met_forecast' })
      await makeSourceState(tx, {
        sourceId: staleForecast.id,
        state: 'stale',
        since: new Date('2026-11-08T01:00:00Z')
      })
      await makeReading(tx, {
        sourceId: staleForecast.id,
        metric: 'forecast_day',
        unit: null,
        value: null,
        itemKey: '2026-11-09',
        observedAt: new Date('2026-11-08T00:00:00Z'),
        valueJson: {
          date: '2026-11-09',
          afternoon_forecast: 'Ribut petir di satu dua tempat',
          gloss_en: { afternoon_forecast: 'Thunderstorms in one or two places' }
        }
      })

      return {
        withUpcomingStorm: await getProjectSummaryRecord(tx, p1.id, now),
        withStaleForecast: await getProjectSummaryRecord(tx, p2.id, now)
      }
    })

    expect(withUpcomingStorm.next_storm_date).toBe('2026-11-10')
    expect(withStaleForecast.next_storm_date).toBeNull()
  })

  test('rejects corrupt call shadow or missing no_call provenance instead of fabricating stale/triggeredAt or a synthetic Sky verdict', async () => {
    const now = new Date('2026-11-08T06:00:00Z')
    await expect(
      inOrg(async (tx) => {
        const { project: created } = await createProjectRecord(tx, {
          name: 'Corrupt Call Shadow',
          slug: 'corrupt-call-shadow',
          siteName: 'APU',
          siteLat: 3.05,
          siteLon: 101.7,
          packs: ['crowd']
        })
        const crowdBundle = await makeBundle(tx, {
          runId: (await makeRun(tx, { projectId: created.id, pack: 'crowd' })).id,
          pack: 'crowd',
          state: 'sent'
        })
        // Call has empty shadow `{}` (default from makeCall if not supplied): must not be fabricated into a Sky verdict.
        await makeCall(tx, {
          bundleId: crowdBundle.id,
          mode: 'surge_night',
          watch: false,
          state: 'sent',
          shadow: {}
        })
        return getProjectSummaryRecord(tx, created.id, now)
      })
    ).rejects.toThrow(/Invalid persisted call shadow/)

    await expect(
      inOrg(async (tx) => {
        const { project: created } = await createProjectRecord(tx, {
          name: 'Missing Blocker Provenance',
          slug: 'missing-blocker-provenance',
          siteName: 'APU',
          siteLat: 3.05,
          siteLon: 101.7,
          packs: ['sky']
        })
        const win = await makeWindow(tx, {
          projectId: created.id,
          startsAt: new Date('2026-11-08T05:00:00Z'),
          endsAt: new Date('2026-11-08T07:00:00Z')
        })
        const skyBundle = await makeBundle(tx, {
          runId: (await makeRun(tx, { projectId: created.id, pack: 'sky' })).id,
          pack: 'sky',
          state: 'sent'
        })
        // Call lists noCall name ['site.rain_60m_mm'] with no provenance in shadow or shadow_state.
        await makeCall(tx, {
          bundleId: skyBundle.id,
          windowId: win.id,
          mode: 'normal',
          watch: false,
          noCall: ['site.rain_60m_mm'],
          state: 'sent',
          shadow: {
            scope: { kind: 'window', id: win.id },
            pack: 'sky',
            mode: 'normal',
            watch: false,
            no_call: null,
            recommendations: [],
            clauses: [],
            open_from: null
          }
        })
        return getProjectSummaryRecord(tx, created.id, now)
      })
    ).rejects.toThrow(/Missing provenance for blocked input/)
  })
})
