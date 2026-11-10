// #146 c-ledger-chain: the four /v1 ledger reads on the #79 §7 test database, through createTestApi with the real
// withTenant and recordAudit (only the auth seams and the archive URL signer are doubles).
import { randomUUID } from 'node:crypto'
import { canonicalJson } from '@skyclause/clauses'
import { LedgerKind, REGISTRY, type Principal } from '@skyclause/contracts'
import {
  appendLedger,
  recordAudit,
  recordPilotArchive,
  systemPrincipal,
  verifyLedger,
  withTenant,
  type Tx
} from '@skyclause/db'
import { makeCall, makeGrade, makeOrganization, makeProject, makeWindow } from '@skyclause/db/test/factories/index'
import { callDraft } from '@skyclause/db/test/bundles/scene'
import { asLogin, memberOf } from '@skyclause/db/test/harness/index'
import fc from 'fast-check'
import { beforeAll, describe, expect, test } from 'vitest'
import { PILOT_ARCHIVE_LABEL, setArchiveUrlSigner } from '../src/services/ledger'
import {
  TEST_NOW,
  apiRequest,
  asApiKey,
  asGuestToken,
  asOAuth,
  asSession,
  asShareLink,
  createTestApi,
  crossOrgCase,
  testCan,
  testDeps,
  testOrg
} from './harness'

const ORG = 'ledger-home'
const OTHER = 'ledger-other'
// The harness's stand-in `can` doesn't bind a share link to its project; #94's does.
const can: typeof testCan = (p, s, t) =>
  testCan(p, s, t) && (p.kind !== 'share_link' || !t?.projectId || p.projectId === t.projectId)
const { v1 } = createTestApi({ deps: testDeps({ withTenant, recordAudit, can }) })
const viewer = asSession({ org: ORG, role: 'viewer' })
let orgId: string

const inOrg = <T>(fn: (tx: Tx) => Promise<T>, org = orgId) => withTenant({ orgId: org, principal: memberOf(org) }, fn)
const newProject = (org = orgId) => inOrg(async (tx) => (await makeProject(tx)).id, org)
const get = (path: string, query?: Record<string, string>) =>
  apiRequest(v1, { as: viewer, method: 'GET', path, org: ORG, query })
type LedgerPage = { data: Array<Record<string, unknown> & { seq: number }>; next_cursor: string; total: number }
const ledgerPage = async (response: Response) => (await response.json()) as LedgerPage

beforeAll(async () => {
  for (const slug of [ORG, OTHER]) await makeOrganization({ id: testOrg(slug).id, slug })
  orgId = testOrg(ORG).id
})

describe('LED-2: altering any stored entry makes the integrity check name the first bad entry', () => {
  const hex32 = fc.uint8Array({ minLength: 32, maxLength: 32 }).map((bytes) => Buffer.from(bytes).toString('hex'))
  // One alteration of entry k of n, as someone with the append-only trigger disabled could make it.
  const alteration = fc.integer({ min: 2, max: 8 }).chain((n) =>
    fc.record({
      n: fc.constant(n),
      k: fc.integer({ min: 1, max: n }),
      change: fc.oneof(
        fc.record({
          field: fc.constant('seq' as const),
          to: fc.oneof(fc.integer({ min: -5, max: 0 }), fc.integer({ min: n + 1, max: n + 20 }))
        }),
        fc.record({ field: fc.constant('kind' as const), to: fc.constantFrom(...LedgerKind.options) }),
        fc.record({ field: fc.constant('refs' as const), to: fc.dictionary(fc.string(), fc.string(), { maxKeys: 3 }) }),
        fc.record({ field: fc.constant('body' as const), to: fc.jsonValue({ maxDepth: 2 }) }),
        // Microseconds, so changes finer than the millisecond the hash reads are caught too.
        fc.record({ field: fc.constant('at' as const), to: fc.integer({ min: -1e9, max: 1e9 }) }),
        fc.record({ field: fc.constant('prev_hash' as const), to: hex32 }),
        fc.record({ field: fc.constant('hash' as const), to: hex32 }),
        fc.record({ field: fc.constant('delete' as const), to: fc.constant(null) })
      )
    })
  )
  const original = (i: number) => ({ kind: 'grade' as const, refs: { grade_id: `g${i}` }, body: { n: i } })
  const unchanged = ({ k, change }: { k: number; change: { field: string; to: unknown } }) => {
    const before: Record<string, unknown> = original(k)
    if (change.field === 'kind' || change.field === 'refs' || change.field === 'body')
      return canonicalJson(change.to) === canonicalJson(before[change.field])
    return change.field === 'at' && change.to === 0
  }

  test('verifyLedger and GET /ledger/verify name exactly that entry (a deleted one by its successor)', async () => {
    await fc.assert(
      fc.asyncProperty(
        alteration.filter((a) => !unchanged(a) && !(a.change.field === 'delete' && a.k === a.n)),
        async ({ n, k, change }) => {
          const projectId = await newProject()
          const entries = []
          for (let i = 1; i <= n; i++) {
            entries.push(await inOrg((tx) => appendLedger(tx, { projectId, ...original(i) })))
          }
          const target = entries[k - 1]!
          await asLogin('postgres', async (client) => {
            await client.query('BEGIN')
            await client.query('ALTER TABLE ledger_entry DISABLE TRIGGER append_only')
            const set = (assignment: string, value: unknown) =>
              client.query(`UPDATE ledger_entry SET ${assignment} WHERE id = $1`, [target.id, value])
            if (change.field === 'delete') await client.query('DELETE FROM ledger_entry WHERE id = $1', [target.id])
            else if (change.field === 'refs' || change.field === 'body')
              await set(`${change.field} = $2::jsonb`, JSON.stringify(change.to))
            else if (change.field === 'at') await set(`at = at + ($2 || ' microseconds')::interval`, String(change.to))
            else await set(`${change.field} = $2`, change.to)
            await client.query('ALTER TABLE ledger_entry ENABLE TRIGGER append_only')
            await client.query('COMMIT')
          })
          const named = change.field === 'delete' ? entries[k]! : target
          const reason =
            change.field === 'seq' || change.field === 'delete'
              ? 'seq_gap'
              : change.field === 'prev_hash'
                ? 'prev_hash'
                : 'hash'
          const firstBad = { id: named.id, seq: change.field === 'seq' ? change.to : named.seq, reason }
          expect(await inOrg((tx) => verifyLedger(tx, projectId))).toEqual({
            ok: false,
            count: k - 1,
            head_hash: k === 1 ? '0'.repeat(64) : entries[k - 2]!.hash,
            first_bad: firstBad
          })
          const response = await get(`/v1/projects/${projectId}/ledger/verify`)
          expect(response.status).toBe(200)
          expect(await response.json()).toMatchObject({
            valid: false,
            checked_entries: k - 1,
            first_bad_entry_id: named.id,
            first_bad: firstBad
          })
        }
      ),
      { numRuns: 100 }
    )
  }, 120_000)

  test('an untouched chain verifies, with its head hash and the time it was checked', async () => {
    const projectId = await newProject()
    await inOrg((tx) => appendLedger(tx, { projectId, ...original(1) }))
    const head = await inOrg((tx) => appendLedger(tx, { projectId, ...original(2) }))
    const response = await get(`/v1/projects/${projectId}/ledger/verify`)
    expect(await response.json()).toEqual({
      valid: true,
      checked_entries: 2,
      first_bad_entry_id: null,
      head_hash: head.hash,
      verified_at: '2026-11-08T02:00:00Z'
    })
  })
})

describe('GET /v1/projects/{id}/ledger', () => {
  /** Moves an entry's `at`, as only a test may (it breaks the chain, which these reads don't check). */
  const stampAt = (id: string, at: string) =>
    asLogin('postgres', async (client) => {
      await client.query('BEGIN')
      await client.query('ALTER TABLE ledger_entry DISABLE TRIGGER append_only')
      await client.query('UPDATE ledger_entry SET at = $2 WHERE id = $1', [id, at])
      await client.query('ALTER TABLE ledger_entry ENABLE TRIGGER append_only')
      await client.query('COMMIT')
    })

  test('pages newest first by cursor, with the filtered total', async () => {
    const projectId = await newProject()
    for (let i = 1; i <= 3; i++)
      await inOrg((tx) => appendLedger(tx, { projectId, kind: 'grade', refs: {}, body: { i } }))
    const first = await get(`/v1/projects/${projectId}/ledger`, { limit: '2' })
    expect(first.status).toBe(200)
    const one = await ledgerPage(first)
    expect(one.data.map((row) => row.seq)).toEqual([3, 2])
    expect(one.total).toBe(3)
    expect(one.next_cursor).toEqual(expect.any(String))
    const two = await (await get(`/v1/projects/${projectId}/ledger`, { limit: '2', cursor: one.next_cursor })).json()
    expect(two).toMatchObject({ data: [{ seq: 1, body: { i: 1 } }], next_cursor: null, total: 3 })
    const bad = await get(`/v1/projects/${projectId}/ledger`, { cursor: 'not-a-cursor' })
    expect(bad.status).toBe(422)
  })

  test('filters by local date in the project’s zone, pack, mode, state and kind', async () => {
    const projectId = await newProject()
    const append = (kind: LedgerKind, body: Record<string, string>) =>
      inOrg((tx) => appendLedger(tx, { projectId, kind, refs: {}, body }))
    const early = await append('call_approved', { pack: 'sky', mode: 'outdoor_limited', approver_role: 'approver' })
    const late = await append('call_sent', { pack: 'sky', mode: 'normal' })
    const next = await append('night_graded', { pack: 'crowd', mode: 'surge_night' })
    // 2 November 00:30 and 23:59:59 MYT, then 3 November 00:00 MYT.
    await stampAt(early.id, '2026-11-01T16:30:00Z')
    await stampAt(late.id, '2026-11-02T15:59:59Z')
    await stampAt(next.id, '2026-11-02T16:00:00Z')
    const seqs = async (query: Record<string, string>) => {
      const body = await ledgerPage(await get(`/v1/projects/${projectId}/ledger`, query))
      return { seqs: body.data.map((row) => row.seq), total: body.total }
    }
    expect(await seqs({ from: '2026-11-02', to: '2026-11-02' })).toEqual({ seqs: [2, 1], total: 2 })
    expect(await seqs({ from: '2026-11-03' })).toEqual({ seqs: [3], total: 1 })
    expect(await seqs({ to: '2026-11-01' })).toEqual({ seqs: [], total: 0 })
    expect(await seqs({ pack: 'crowd' })).toEqual({ seqs: [3], total: 1 })
    expect(await seqs({ pack: 'sky', mode: 'normal' })).toEqual({ seqs: [2], total: 1 })
    expect(await seqs({ state: 'approved' })).toEqual({ seqs: [1], total: 1 })
    expect(await seqs({ state: 'drafted' })).toEqual({ seqs: [], total: 0 })
    expect(await seqs({ kind: 'night_graded' })).toEqual({ seqs: [3], total: 1 })
  })

  test('a row carries the window and grade its refs name, the pack and approver role from its body', async () => {
    const projectId = await newProject()
    const { windowId, gradeId } = await inOrg(async (tx) => {
      const window = await makeWindow(tx, { projectId })
      const grade = await makeGrade(tx, { projectId, windowId: window.id })
      return { windowId: window.id, gradeId: grade.id }
    })
    const entry = await inOrg((tx) =>
      appendLedger(tx, {
        projectId,
        kind: 'grade',
        refs: { window_id: windowId, grade_id: gradeId },
        body: { pack: 'sky', approver_role: 'approver', outcome: 'hit' }
      })
    )
    const fix = await inOrg((tx) =>
      appendLedger(tx, {
        projectId,
        kind: 'correction',
        refs: {},
        body: { approver_role: 'nobody' },
        corrects: entry.id
      })
    )
    const { data } = await ledgerPage(await get(`/v1/projects/${projectId}/ledger`))
    expect(data[1]).toMatchObject({
      id: entry.id,
      project_id: projectId,
      seq: 1,
      kind: 'grade',
      refs: { window_id: windowId, grade_id: gradeId },
      prev_hash: '0'.repeat(64),
      hash: entry.hash,
      pack: 'sky',
      approver_role: 'approver',
      call: null,
      window: { id: windowId, project_id: projectId },
      grade: { id: gradeId, window_id: windowId }
    })
    expect(data[1]!.at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/)
    expect(data[1]).not.toHaveProperty('corrects')
    expect(data[0]).toMatchObject({ id: fix.id, corrects: entry.id, pack: null, approver_role: null, window: null })
  })
})

describe('LedgerRow.call: the call an entry references, by who is reading', () => {
  const SUBSCRIBERS = ['5d2a7c1e-0000-4000-8000-0000000000a1', '5d2a7c1e-0000-4000-8000-0000000000a2']
  const NOTICES = [{ language: 'en', subject: 'Class held outdoors', body: 'Rain will clear by 3 pm.' }]
  const scene = async (approved: boolean) => {
    const projectId = await newProject()
    const windowId = '7b1c0f00-0000-4000-8000-000000000001'
    const callId = await inOrg(async (tx) => {
      const { shadow } = callDraft({ windowId: windowId, mode: 'outdoor_limited' })
      const row = await makeCall(tx, {
        projectId,
        shadow,
        mode: 'outdoor_limited',
        notices: NOTICES,
        recipients: SUBSCRIBERS,
        recommendations: ['shift_start'],
        reason: 'Heavy rain cell over the field',
        state: approved ? 'approved' : 'drafted',
        approvedAt: approved ? new Date('2026-11-08T01:00:00Z') : null
      })
      await appendLedger(tx, {
        projectId,
        kind: 'call_approved',
        refs: { call_id: row.id },
        body: { pack: 'sky', mode: 'outdoor_limited', approver_role: 'approver' }
      })
      return row.id
    })
    return { projectId, callId }
  }
  const entryCall = async (projectId: string, as = viewer) => {
    const response = await apiRequest(v1, { as, method: 'GET', path: `/v1/projects/${projectId}/ledger`, org: ORG })
    expect(response.status).toBe(200)
    const text = await response.text()
    return { text, call: (JSON.parse(text) as LedgerPage).data[0]!.call as Record<string, unknown> | null }
  }

  test('a member sees the whole call, but never its recipients', async () => {
    const { projectId, callId } = await scene(true)
    const { text, call } = await entryCall(projectId)
    expect(call).toMatchObject({
      id: callId,
      mode: 'outdoor_limited',
      state: 'approved',
      notices: NOTICES,
      recommendations: ['shift_start'],
      reason: 'Heavy rain cell over the field',
      recipients: []
    })
    for (const subscriber of SUBSCRIBERS) expect(text).not.toContain(subscriber)
  })

  test('a reader without a role sees what public_call allows and nothing of the notices or recipients', async () => {
    const { projectId, callId } = await scene(true)
    const link = asShareLink({ org: ORG, projectId, access: 'reviewer' })
    const { text, call } = await entryCall(projectId, link)
    expect(call).toMatchObject({
      id: callId,
      mode: 'outdoor_limited',
      state: 'approved',
      notices: [],
      recommendations: [],
      reason: '',
      recipients: []
    })
    expect(text).not.toContain('Rain will clear')
    expect(text).not.toContain('Heavy rain cell')
    expect(text).not.toContain('shift_start')
    for (const subscriber of SUBSCRIBERS) expect(text).not.toContain(subscriber)
  })

  test('a call public_call hides (not yet approved) stays null for a reader without a role, not for a member', async () => {
    const { projectId, callId } = await scene(false)
    expect((await entryCall(projectId, asShareLink({ org: ORG, projectId, access: 'reviewer' }))).call).toBeNull()
    expect((await entryCall(projectId)).call).toMatchObject({ id: callId, state: 'drafted' })
  })

  test('an API key reads as a member; a view-only share link cannot read the ledger', async () => {
    const { projectId } = await scene(true)
    const key = asApiKey({ org: ORG, role: 'viewer', scopes: ['read'] })
    expect((await entryCall(projectId, key)).call).toMatchObject({ notices: NOTICES, recipients: [] })
    const link = asShareLink({ org: ORG, projectId, access: 'view' })
    expect(
      (await apiRequest(v1, { as: link, method: 'GET', path: `/v1/projects/${projectId}/ledger`, org: ORG })).status
    ).toBe(403)
  })

  test('an entry whose call is missing, in another project or not named stays null', async () => {
    const { callId } = await scene(true)
    const projectId = await newProject()
    await inOrg(async (tx) => {
      await appendLedger(tx, { projectId, kind: 'call_approved', refs: { call_id: callId }, body: {} })
      await appendLedger(tx, { projectId, kind: 'call_sent', refs: { call_id: 'not-a-uuid' }, body: {} })
      await appendLedger(tx, { projectId, kind: 'grade', refs: {}, body: {} })
      await appendLedger(tx, {
        projectId,
        kind: 'call_sent',
        refs: { call_id: '0b1c0f00-0000-4000-8000-0000000000ff' },
        body: {}
      })
    })
    const { data } = await ledgerPage(await get(`/v1/projects/${projectId}/ledger`))
    expect(data.map((row) => row.call)).toEqual([null, null, null, null])
  })
})

describe('#521 LedgerRow.window: its title and who declared it go to members only (NFR-11)', () => {
  const scene = async () => {
    const projectId = await newProject()
    const window = await inOrg(async (tx) => {
      const row = await makeWindow(tx, { projectId, title: 'Lecture 3A' })
      await appendLedger(tx, { projectId, kind: 'grade', refs: { window_id: row.id }, body: {} })
      return row
    })
    return { projectId, window }
  }
  const entryWindow = async (projectId: string, as: Principal) => {
    const response = await apiRequest(v1, { as, method: 'GET', path: `/v1/projects/${projectId}/ledger`, org: ORG })
    expect(response.status).toBe(200)
    const text = await response.text()
    return { text, window: (JSON.parse(text) as LedgerPage).data[0]!.window }
  }

  test.each([
    {
      reader: 'a reviewer share link',
      as: (projectId: string) => asShareLink({ org: ORG, projectId, access: 'reviewer' })
    },
    { reader: 'a guest token', as: () => asGuestToken({ org: ORG }) },
    {
      reader: 'a link-bound OAuth grant',
      as: (projectId: string) =>
        asOAuth({ org: ORG, role: null, resource: 'api', projectIds: [projectId], shareLinkId: randomUUID() })
    },
    { reader: 'a session with the guest role', as: () => asSession({ org: ORG, role: 'guest' }) },
    { reader: 'a guest’s API key', as: () => asApiKey({ org: ORG, role: 'guest', scopes: ['read'] }) }
  ])('$reader gets the window without its title or who declared it', async ({ as }) => {
    const { projectId, window } = await scene()
    const { text, window: seen } = await entryWindow(projectId, as(projectId))
    expect(seen).toMatchObject({ id: window.id, project_id: projectId, title: '', declared_by: '' })
    expect(text).not.toContain('Lecture 3A')
    expect(text).not.toContain(window.declaredBy)
  })

  test('a member, by session or API key, sees both', async () => {
    const { projectId, window } = await scene()
    for (const as of [viewer, asApiKey({ org: ORG, role: 'viewer', scopes: ['read'] })]) {
      expect((await entryWindow(projectId, as)).window).toMatchObject({
        title: 'Lecture 3A',
        declared_by: window.declaredBy
      })
    }
  })
})

describe('GET /v1/projects/{id}/ledger/export', () => {
  test('streams seq, at, kind, refs, body, prev_hash and hash oldest first, refs and body as JCS', async () => {
    const projectId = await newProject()
    const first = await inOrg((tx) =>
      appendLedger(tx, { projectId, kind: 'grade', refs: { grade_id: 'g1' }, body: { outcome: 'hit', n: 3 } })
    )
    const second = await inOrg((tx) => appendLedger(tx, { projectId, kind: 'call_sent', refs: {}, body: {} }))
    const response = await get(`/v1/projects/${projectId}/ledger/export`)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
    const at = (
      await inOrg((tx) => tx.query.ledgerEntry.findMany({ where: (l, { eq }) => eq(l.projectId, projectId) }))
    )
      .sort((a, b) => a.seq - b.seq)
      .map((row) => row.at.toISOString())
    expect(await response.text()).toBe(
      'seq,at,kind,refs,body,prev_hash,hash\r\n' +
        `1,${at[0]},grade,"{""grade_id"":""g1""}","{""n"":3,""outcome"":""hit""}",${'0'.repeat(64)},${first.hash}\r\n` +
        `2,${at[1]},call_sent,{},{},${first.hash},${second.hash}\r\n`
    )
    const graded = await (await get(`/v1/projects/${projectId}/ledger/export`, { kind: 'call_sent' })).text()
    expect(
      graded
        .split('\r\n')
        .slice(1, -1)
        .map((line) => line.split(',')[0])
    ).toEqual(['2'])
  })

  test('streams past one page', async () => {
    const projectId = await newProject()
    await inOrg(async (tx) => {
      for (let i = 0; i < 501; i++) await appendLedger(tx, { projectId, kind: 'grade', refs: {}, body: { i } })
    })
    const lines = (await (await get(`/v1/projects/${projectId}/ledger/export`)).text()).split('\r\n')
    expect(lines.at(-1)).toBe('')
    expect(lines.slice(1, -1).map((line) => Number(line.split(',')[0]))).toEqual(
      Array.from({ length: 501 }, (_, i) => i + 1)
    )
  })
})

describe('LED-8: GET /v1/projects/{id}/pilot-archive', () => {
  test('lists the archived files with the label and 15-minute signed URLs, and writes no ledger entry', async () => {
    const projectId = await newProject()
    const signed: Array<{ path: string; expiresAt: Date }> = []
    setArchiveUrlSigner(async (path, expiresAt) => {
      signed.push({ path, expiresAt })
      return `https://storage.googleapis.com/skyclause-test-archive/${path}?X-Goog-Expires=900`
    })
    const objectPath = `orgs/${orgId}/pilot/jira_register/${'ab'.repeat(32)}-register.csv`
    await withTenant({ orgId, principal: systemPrincipal('pilot-archive') }, (tx) =>
      recordPilotArchive(tx, {
        projectId,
        kind: 'jira_register',
        objectPath,
        sha256: 'ab'.repeat(32),
        capturedAt: new Date('2026-11-17T10:00:00Z')
      })
    )
    const response = await get(`/v1/projects/${projectId}/pilot-archive`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      label: 'Pilot archive (Gemini Enterprise, November 2026)',
      data: [
        {
          project_id: projectId,
          kind: 'jira_register',
          url: `https://storage.googleapis.com/skyclause-test-archive/${objectPath}?X-Goog-Expires=900`,
          sha256: 'ab'.repeat(32),
          captured_at: '2026-11-17T10:00:00Z'
        }
      ],
      next_cursor: null
    })
    expect(signed).toEqual([{ path: objectPath, expiresAt: new Date(TEST_NOW.getTime() + 15 * 60_000) }])
    expect(await (await get(`/v1/projects/${projectId}/ledger`)).json()).toMatchObject({ data: [], total: 0 })
    expect(PILOT_ARCHIVE_LABEL).toBe('Pilot archive (Gemini Enterprise, November 2026)')
  })
})

describe('access', () => {
  const operations = ['listLedgerEntries', 'exportLedger', 'verifyLedger', 'getPilotArchive'] as const
  const pathOf = (operationId: string, id: string) =>
    REGISTRY.find((route) => route.operationId === operationId)!.path.replace('{id}', id)

  test.each(operations)('%s answers 404 for another organisation’s project and an unknown ID', async (operationId) => {
    const elsewhere = await newProject(testOrg(OTHER).id)
    await crossOrgCase(operationId, { app: v1, as: viewer, org: ORG, params: { id: elsewhere } }).run()
    for (const id of ['not-a-uuid', '01900000-0000-7000-8000-000000000000']) {
      expect((await get(pathOf(operationId, id))).status).toBe(404)
    }
  })

  test.each(operations)('%s is denied below ledger.view: an API key without read', async (operationId) => {
    const projectId = await newProject()
    const key = asApiKey({ org: ORG, role: 'owner', scopes: ['draft'] })
    const response = await apiRequest(v1, { as: key, method: 'GET', path: pathOf(operationId, projectId) })
    expect(response.status).toBe(403)
  })

  test('LED-1: the registry (so the SDK, CLI and MCP tools) has no ledger update or delete operation', () => {
    const ledgerRoutes = REGISTRY.filter((route) => route.path.includes('ledger'))
    expect(ledgerRoutes.length).toBeGreaterThan(0)
    expect(ledgerRoutes.filter((route) => route.method !== 'get')).toEqual([])
  })
})
