// #107 a-audit-log: the `/api/orgs/{org}/audit[/export]` reads on the #79 §7 test database, through
// createTestApi with the real withTenant and recordAudit (only the auth seams are doubles).
import { exportAuditJson } from '../src/services/audit'
import { Problem, REGISTRY } from '@skyclause/contracts'
import { auditEvent, recordAudit, user, withTenant, type Tx } from '@skyclause/db'
import { authDatabase } from '@skyclause/db/auth'
import { makeMember, makeOrganization, makeProject, makeUser } from '@skyclause/db/test/factories/index'
import { memberOf } from '@skyclause/db/test/harness/index'
import { count, eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, test } from 'vitest'
import {
  apiRequest,
  asApiKey,
  asDevice,
  asGuestToken,
  asOAuth,
  asSession,
  asShareLink,
  createTestApi,
  crossOrgCase,
  testDeps,
  testOrg,
  type TestDeps
} from './harness'

const ORG = 'audit-home'
const OTHER = 'audit-other'
let deps: TestDeps
let api: ReturnType<typeof createTestApi>['api']
let orgId: string
let projectId: string

const inOrg = <T>(fn: (tx: Tx) => Promise<T>, principal = memberOf(orgId), org = orgId) =>
  withTenant({ orgId: org, principal }, fn)

const owner = () => asSession({ org: ORG, role: 'owner' })
const get = (path: string, query?: Record<string, string>, as = owner()) =>
  apiRequest(api, { as, method: 'GET', path, org: ORG, query })

const exportCount = () =>
  inOrg((tx) =>
    tx
      .select({ total: count() })
      .from(auditEvent)
      .where(eq(auditEvent.action, 'export.requested'))
      .then((rows) => rows[0]!.total)
  )

/** One RFC 4180 record per line; quoted fields may hold commas, quotes and CRLF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += char
    } else if (char === '"') quoted = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\r' && text[i + 1] === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
    } else field += char
  }
  return rows
}

beforeAll(async () => {
  for (const slug of [ORG, OTHER]) await makeOrganization({ id: testOrg(slug).id, slug })
  orgId = testOrg(ORG).id
  deps = testDeps({ withTenant, recordAudit })
  api = createTestApi({ deps }).api
  projectId = await inOrg((tx) => makeProject(tx).then((project) => project.id))
  // Known actors, targets and times: wire names resolve from auth.user, unknown accounts read "Deleted account".
  const account = await makeUser({ name: 'Aina Audit' })
  await makeMember({ organizationId: orgId, userId: account.id, role: 'admin' })
  const gone = await makeUser({ name: 'Gone User' })
  await makeMember({ organizationId: orgId, userId: gone.id, role: 'viewer' })
  const writers = [
    { ...memberOf(orgId), accountId: account.id },
    { ...memberOf(orgId), accountId: gone.id },
    memberOf(orgId),
    memberOf(orgId)
  ]
  const targets = ['source:one', 'source:two', 'project_pack:one', 'project_pack:two'] as const
  for (const [i, principal] of writers.entries()) {
    await inOrg(
      (tx) =>
        recordAudit(tx, {
          action: i % 2 === 0 ? 'source.bound' : 'sla.changed',
          target: { type: targets[i]!.split(':')[0]!, id: targets[i]! },
          projectId,
          before: i === 0 ? { note: 'a, "quoted" value' } : { seq: i },
          after: { seq: i + 1 }
        }),
      principal
    )
  }
  // The second writer's account is deleted after writing: its row keeps the pseudonymous ID (AUD-4).
  await authDatabase().update(user).set({ deletedAt: new Date() }).where(eq(user.id, gone.id))
})

describe('list', () => {
  test('newest first with the entry columns, unknown accounts reading "Deleted account"', async () => {
    const response = await get('/api/orgs/audit-home/audit')
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      data: Array<Record<string, unknown>>
      next_cursor: string | null
    }
    expect(body.next_cursor).toBeNull()
    expect(body.data).toHaveLength(4)
    const created = body.data.map((row) => String(row.created_at))
    expect([...created].sort().reverse()).toEqual(created)
    expect(Object.keys(body.data[0]!).sort()).toEqual(
      [
        'id',
        'project_id',
        'actor_type',
        'actor_id',
        'actor_name',
        'actor_role',
        'client',
        'client_name',
        'action',
        'target_type',
        'target_id',
        'before',
        'after',
        'created_at'
      ].sort()
    )
    const live = body.data.find((row) => row.actor_name === 'Aina Audit')
    expect(live).toMatchObject({ actor_type: 'account', actor_role: 'admin' })
    expect(body.data.filter((row) => row.actor_name === 'Deleted account').length).toBeGreaterThan(0)
  })

  test('the cursor pages with limit 2 and no gaps or repeats', async () => {
    const seen: string[] = []
    let cursor: string | undefined
    for (;;) {
      const response = await get('/api/orgs/audit-home/audit', { limit: '2', ...(cursor ? { cursor } : {}) })
      expect(response.status).toBe(200)
      const body = (await response.json()) as { data: Array<{ id: string }>; next_cursor: string | null }
      seen.push(...body.data.map((row) => row.id))
      if (!body.next_cursor) break
      cursor = body.next_cursor
    }
    expect(seen).toHaveLength(4)
    expect(new Set(seen).size).toBe(4)
  })

  test('filters combine and a bad cursor is 422', async () => {
    const known = await get('/api/orgs/audit-home/audit')
    const rows = ((await known.json()) as { data: Array<Record<string, unknown>> }).data
    const row = rows[0]!
    const filtered = await get('/api/orgs/audit-home/audit', {
      action: String(row.action),
      actor_id: String(row.actor_id),
      target_type: String(row.target_type),
      target_id: String(row.target_id),
      project_id: String(row.project_id),
      from: '2026-01-01T00:00:00Z',
      to: '2027-01-01T00:00:00Z'
    })
    expect(filtered.status).toBe(200)
    expect(((await filtered.json()) as { data: unknown[] }).data).toHaveLength(1)
    const bad = await get('/api/orgs/audit-home/audit', { cursor: 'not-a-cursor' })
    expect(bad.status).toBe(422)
  })

  test('owner and admin read; every other role, key and token gets 403', async () => {
    for (const role of ['owner', 'admin'] as const) {
      const response = await apiRequest(api, {
        as: asSession({ org: ORG, role }),
        method: 'GET',
        path: '/api/orgs/audit-home/audit',
        org: ORG
      })
      expect(response.status, role).toBe(200)
    }
    for (const role of ['approver', 'editor', 'viewer', 'guest'] as const) {
      const response = await apiRequest(api, {
        as: asSession({ org: ORG, role }),
        method: 'GET',
        path: '/api/orgs/audit-home/audit',
        org: ORG
      })
      expect(response.status, role).toBe(403)
    }
    const denied = [
      asApiKey({ org: ORG, role: 'owner', scopes: ['read', 'draft', 'admin'] }),
      asOAuth({ org: ORG, role: 'owner' }),
      asShareLink({ org: ORG }),
      asDevice({ org: ORG }),
      asGuestToken({ org: ORG })
    ]
    for (const as of denied) {
      const response = await apiRequest(api, { as, method: 'GET', path: '/api/orgs/audit-home/audit', org: ORG })
      expect(response.status, as.kind).toBe(403)
    }
  })

  test('cross-organisation reads are 404', async () => {
    for (const operationId of ['listAuditEntries', 'exportAuditLog'] as const) {
      const { run } = crossOrgCase(operationId, { app: api, as: owner(), params: { org: OTHER } })
      await run()
    }
  })
})

describe('unbuilt writes', () => {
  test('the operation registry has no write operation on audit', () => {
    expect(
      REGISTRY.filter((route) => route.path.startsWith('/api/orgs/{org}/audit')).map((route) => route.method)
    ).toEqual(['get', 'get'])
  })

  test.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s answers 404 with a problem', async (method) => {
    for (const path of ['/api/orgs/audit-home/audit', '/api/orgs/audit-home/audit/export']) {
      const response = await apiRequest(api, { as: owner(), method, path, org: ORG })
      expect(response.status, `${method} ${path}`).toBe(404)
      expect(Problem.safeParse(await response.json()).success, `${method} ${path}`).toBe(true)
    }
  })
})

describe('export', () => {
  test('CSV and JSON match the filtered list row for row, hold no email, and write one entry each', async () => {
    const before = await exportCount()
    const listBefore = (await (await get('/api/orgs/audit-home/audit')).json()) as { data: Array<unknown> }
    const csvResponse = await get('/api/orgs/audit-home/audit/export')
    expect(csvResponse.status).toBe(200)
    expect(csvResponse.headers.get('Content-Type')).toContain('text/csv')
    const csvText = await csvResponse.text()
    const jsonResponse = await get('/api/orgs/audit-home/audit/export', { format: 'json' })
    expect(jsonResponse.status).toBe(200)
    const jsonText = await jsonResponse.text()
    expect(await exportCount()).toBe(before + 2)
    const EMAIL = /[^\s@"]+@[^\s@"]+\.[^\s@"]+/
    expect(EMAIL.test(csvText)).toBe(false)
    expect(EMAIL.test(jsonText)).toBe(false)

    const listAfter = (await (await get('/api/orgs/audit-home/audit')).json()) as {
      data: Array<Record<string, unknown>>
    }
    const json = JSON.parse(jsonText) as Array<Record<string, unknown>>
    expect(json).toEqual(listAfter.data)
    expect(listAfter.data.length).toBe(listBefore.data.length + 2)

    const [header, ...lines] = parseCsv(csvText)
    expect(header).toEqual([
      'id',
      'project_id',
      'actor_type',
      'actor_id',
      'actor_name',
      'actor_role',
      'client',
      'client_name',
      'action',
      'target_type',
      'target_id',
      'before',
      'after',
      'created_at'
    ])
    const columns = header!
    const fromCsv = lines.map((fields) =>
      Object.fromEntries(
        columns.map((column, i) => {
          const raw = fields[i]!
          if (column === 'before' || column === 'after') return [column, raw === '' ? null : JSON.parse(raw)]
          if (column === 'project_id' || column.endsWith('_name') || column.endsWith('_role'))
            return [column, raw === '' ? null : raw]
          return [column, raw]
        })
      )
    )
    // Both formats hold the filtered set newest first; JSON also includes its own export entry.
    expect(fromCsv).toHaveLength(json.length - 1)
    expect(fromCsv).toEqual(json.slice(1))
    // RFC 4180: the JSON's quotes are doubled inside the quoted CSV field (`\"` becomes `\"\"`).
    expect(csvText).toContain('a, \\""quoted\\"" value')
  })

  test('without format the export is CSV', async () => {
    const response = await get('/api/orgs/audit-home/audit/export')
    expect(response.headers.get('Content-Type')).toContain('text/csv')
  })
})

test('malformed cursor positions return a query validation problem', async () => {
  for (const position of [
    { at: 'invalid-date', id: orgId },
    { at: '2026-11-01T00:00:00.123456Z', id: 'invalid-id' },
    { at: '2026-02-30T00:00:00Z', id: orgId }
  ]) {
    const cursor = Buffer.from(JSON.stringify(position)).toString('base64url')
    const response = await get('/api/orgs/audit-home/audit', { cursor })
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ errors: [{ in: 'query', pointer: '/cursor' }] })
  }
})

test('list cursors preserve historical microseconds across tied timestamps', async () => {
  const target = 'legacy-list'
  await inOrg((tx) =>
    tx.insert(auditEvent).values(
      Array.from({ length: 250 }, () => ({
        orgId,
        actorType: 'system' as const,
        actorId: 'legacy-writer',
        client: 'worker' as const,
        action: 'source.bound',
        targetType: target,
        targetId: target,
        at: sql`'2026-11-01T00:00:00.123456Z'::timestamptz`
      }))
    )
  )
  const seen: string[] = []
  let cursor: string | undefined
  for (let pages = 0; pages < 10; pages++) {
    const response = await get('/api/orgs/audit-home/audit', {
      target_type: target,
      limit: '50',
      ...(cursor ? { cursor } : {})
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: Array<{ id: string }>; next_cursor: string | null }
    seen.push(...body.data.map((row) => row.id))
    if (!body.next_cursor) break
    cursor = body.next_cursor
  }
  expect(seen).toHaveLength(250)
  expect(new Set(seen).size).toBe(250)
})

test('exports stream multiple pages with historical timestamp precision and matching order', async () => {
  const target = 'legacy-export'
  await inOrg((tx) =>
    tx.insert(auditEvent).values(
      Array.from({ length: 1001 }, () => ({
        orgId,
        actorType: 'system' as const,
        actorId: 'legacy-writer',
        client: 'worker' as const,
        action: 'source.bound',
        targetType: target,
        targetId: target,
        at: sql`'2099-11-01T00:00:00.123456Z'::timestamptz`
      }))
    )
  )
  const csv = parseCsv(await (await get('/api/orgs/audit-home/audit/export', { target_type: target })).text())
  const json = (await (
    await get('/api/orgs/audit-home/audit/export', { target_type: target, format: 'json' })
  ).json()) as Array<{ id: string }>
  expect(csv).toHaveLength(1002)
  expect(json).toHaveLength(1001)
  expect(new Set(json.map((row) => row.id)).size).toBe(1001)
  expect(csv.slice(1).map((row) => row[0])).toEqual(json.map((row) => row.id))

  let pageReads = 0
  const stream = await inOrg((tx) =>
    exportAuditJson({ tx, principal: tx.principal }, { filters: { target_type: target } }, (fn) => {
      pageReads++
      return inOrg((next) => fn({ tx: next, principal: next.principal }))
    })
  )
  const reader = stream.getReader()
  expect(new TextDecoder().decode((await reader.read()).value)).toBe('[')
  expect(pageReads).toBe(0)
  const chunks: Uint8Array[] = []
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    chunks.push(value!)
  }
  expect(pageReads).toBe(3)
  const exported = JSON.parse('[' + Buffer.concat(chunks).toString()) as Array<{ id: string }>
  expect(exported.map((row) => row.id)).toEqual(json.map((row) => row.id))
})
