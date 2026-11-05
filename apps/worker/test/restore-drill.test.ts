import { expect, test, vi } from 'vitest'
import { registry } from '../src/registry'
import { runDrill, type DrillDatabase, type DrillReads } from '../src/restore-drill/drill'
import { createNeonClient } from '../src/restore-drill/neon'

const PROJECT = 'billowing-glade-35477031'
const NOW = Date.parse('2026-11-06T23:00:00.000Z')

interface Call {
  method: string
  path: string
  body: unknown
}

/** A double of the Neon API v2 routes the drill calls; `activeAfter` polls report `init` before `active`. */
function fakeNeon(
  options: {
    activeAfter?: number
    windowS?: number
    snapshots?: number
    branches?: Array<{ id: string; name: string }>
    failDelete?: boolean
  } = {}
) {
  const calls: Call[] = []
  const branches = new Map((options.branches ?? [{ id: 'br-main', name: 'main' }]).map((b) => [b.id, b.name]))
  let polls = 0
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    const path = url.pathname.replace('/api/v2', '')
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, path, body })
    if (method === 'GET' && path === `/projects/${PROJECT}`) {
      return json(200, { project: { id: PROJECT, history_retention_seconds: options.windowS ?? 21600 } })
    }
    if (method === 'GET' && path === `/projects/${PROJECT}/snapshots`) {
      const snapshots = Array.from({ length: options.snapshots ?? 0 }, (_, i) => ({ id: `snap-${i}`, manual: true }))
      return json(200, { snapshots })
    }
    if (method === 'GET' && path === `/projects/${PROJECT}/branches`) {
      return json(200, { branches: [...branches].map(([id, name]) => ({ id, name })) })
    }
    if (method === 'POST' && path === `/projects/${PROJECT}/branches`) {
      const { name } = (body as { branch: { name: string } }).branch
      branches.set('br-drill', name)
      return json(201, {
        branch: { id: 'br-drill', name, current_state: 'init' },
        endpoints: [{ id: 'ep-drill', host: 'ep-drill.ap-southeast-1.aws.neon.tech', current_state: 'init' }],
        connection_uris: [
          { connection_uri: 'postgresql://migrator:s3cret@ep-drill.ap-southeast-1.aws.neon.tech/skyclause' }
        ]
      })
    }
    if (method === 'GET' && path === `/projects/${PROJECT}/endpoints/ep-drill`) {
      polls += 1
      return json(200, {
        endpoint: { id: 'ep-drill', current_state: polls > (options.activeAfter ?? 0) ? 'active' : 'init' }
      })
    }
    const deleted = path.match(new RegExp(`^/projects/${PROJECT}/branches/([^/]+)$`))?.[1]
    if (method === 'DELETE' && deleted && branches.has(deleted)) {
      if (options.failDelete) return json(500, { code: '', message: 'internal error' })
      branches.delete(deleted)
      return json(200, { branch: { id: deleted } })
    }
    return json(404, { code: '', message: `no route ${method} ${path}` })
  }
  return { fetch, calls, branches }
}

/** A clock whose sleep advances it, so drill timings are exact. */
function fakeClock(start = NOW) {
  let at = start
  return { now: () => at, sleep: async (ms: number) => void (at += ms), advance: (ms: number) => void (at += ms) }
}

function neonFor(api: ReturnType<typeof fakeNeon>) {
  return createNeonClient({ apiKey: 'test-key', projectId: PROJECT, fetch: api.fetch })
}

test('a drill branches 10 minutes back, times readiness, reads back the window and snapshots and deletes the branch', async () => {
  const api = fakeNeon({ activeAfter: 3 })
  const clock = fakeClock()

  const { record, misses } = await runDrill({ neon: neonFor(api), database: null, ...clock, pollMs: 2000 })

  expect(misses).toEqual([])
  expect(record).toEqual({
    point: '2026-11-06T22:50:00.000Z',
    branch: 'drill-20261106T225000Z',
    window_s: 21600,
    snapshots: 0,
    ready_s: 6,
    verified_s: 0,
    rto_ok: true,
    rpo_s: null,
    lag_s: null,
    projects: 0,
    entries: 0,
    first_bad: null,
    deleted: true,
    swept: 0,
    ledger: 'not built (#146)'
  })
  const create = api.calls.find((call) => call.method === 'POST')
  expect(create?.body).toEqual({
    branch: { name: 'drill-20261106T225000Z', parent_timestamp: '2026-11-06T22:50:00.000Z' },
    endpoints: [{ type: 'read_write' }]
  })
  expect([...api.branches.values()]).toEqual(['main'])
})

type Verdicts = Record<string, Awaited<ReturnType<DrillReads['verifyLedger']>>>

/** A double of packages/db's drill reads: one side for the branch host, one for production. */
function fakeDatabase(
  sides: { branch: { verdicts: Verdicts; newest: string | null }; production: { newest: string | null } },
  clock: ReturnType<typeof fakeClock>,
  failOn?: 'verifyLedger'
) {
  const hosts: Array<string | null> = []
  const database: DrillDatabase = {
    async read(host, fn) {
      hosts.push(host)
      const side = host === null ? { verdicts: {}, ...sides.production } : sides.branch
      return fn({
        projectIds: async () => Object.keys(side.verdicts),
        verifyLedger: async (projectId) => {
          clock.advance(1500)
          if (failOn === 'verifyLedger') throw new Error('connection reset')
          return side.verdicts[projectId]!
        },
        newestWrite: async (at) => {
          const newest = side.newest === null ? null : new Date(side.newest)
          return newest && newest <= at ? newest : null
        }
      })
    }
  }
  return { database, hosts }
}

const ok = (count: number) => ({ ok: true as const, count, head_hash: 'ab'.repeat(32) })

test('with the database side, the drill walks every project on the branch and finds nothing lost', async () => {
  const api = fakeNeon({ activeAfter: 1 })
  const clock = fakeClock()
  const { database, hosts } = fakeDatabase(
    {
      branch: { verdicts: { p1: ok(3), p2: ok(2) }, newest: '2026-11-06T22:45:00.000Z' },
      production: { newest: '2026-11-06T22:45:00.000Z' }
    },
    clock
  )

  const { record, misses } = await runDrill({ neon: neonFor(api), database, ...clock, pollMs: 2000 })

  expect(misses).toEqual([])
  expect(record).toMatchObject({
    ready_s: 2,
    verified_s: 3,
    rto_ok: true,
    rpo_s: 0,
    lag_s: 300,
    projects: 2,
    entries: 5,
    first_bad: null,
    deleted: true
  })
  expect(record).not.toHaveProperty('ledger')
  expect(hosts).toEqual(['ep-drill.ap-southeast-1.aws.neon.tech', null])
})

test('a branch whose newest write trails production by more than 5 minutes misses RPO and is still deleted', async () => {
  const api = fakeNeon()
  const clock = fakeClock()
  const { database } = fakeDatabase(
    {
      branch: { verdicts: { p1: ok(1) }, newest: '2026-11-06T22:40:00.000Z' },
      production: { newest: '2026-11-06T22:46:00.000Z' }
    },
    clock
  )

  const { record, misses } = await runDrill({ neon: neonFor(api), database, ...clock })

  expect(record).toMatchObject({ rpo_s: 360, lag_s: 600, deleted: true })
  expect(misses).toEqual(['RPO: the branch trails production by 360 s, over 300 s'])
  expect([...api.branches.values()]).toEqual(['main'])
})

test('a broken chain is reported as first_bad, the other projects are still walked, and the branch is deleted', async () => {
  const api = fakeNeon()
  const clock = fakeClock()
  const { database } = fakeDatabase(
    {
      branch: {
        verdicts: { p1: { ok: false, first_bad: { id: 'e-7', seq: 7, reason: 'prev_hash' } }, p2: ok(4) },
        newest: '2026-11-06T22:45:00.000Z'
      },
      production: { newest: '2026-11-06T22:45:00.000Z' }
    },
    clock
  )

  const { record, misses } = await runDrill({ neon: neonFor(api), database, ...clock })

  expect(record).toMatchObject({
    projects: 2,
    entries: 4,
    first_bad: { project: 'p1', id: 'e-7', seq: 7, reason: 'prev_hash' },
    deleted: true
  })
  expect(misses).toEqual(['ledger: project p1 breaks at entry e-7, seq 7 (prev_hash)'])
})

test('a compute that never becomes active fails the drill at 4 hours and the branch is deleted', async () => {
  const api = fakeNeon({ activeAfter: Infinity })
  const clock = fakeClock()

  await expect(runDrill({ neon: neonFor(api), database: null, ...clock, pollMs: 60_000 })).rejects.toThrow(
    "drill-20261106T225000Z wasn't accepting connections within 14400 s"
  )
  expect(clock.now() - NOW).toBe(4 * 3600 * 1000)
  expect([...api.branches.values()]).toEqual(['main'])
})

test('a failing ledger walk propagates its error and the branch is still deleted', async () => {
  const api = fakeNeon()
  const clock = fakeClock()
  const { database } = fakeDatabase(
    { branch: { verdicts: { p1: ok(1) }, newest: null }, production: { newest: null } },
    clock,
    'verifyLedger'
  )

  await expect(runDrill({ neon: neonFor(api), database, ...clock })).rejects.toThrow('connection reset')
  expect([...api.branches.values()]).toEqual(['main'])
})

test('SIGTERM stops the drill and the branch is still deleted', async () => {
  const api = fakeNeon({ activeAfter: Infinity })
  const clock = fakeClock()
  const controller = new AbortController()
  const sleep = async (ms: number) => {
    await clock.sleep(ms)
    controller.abort()
  }

  await expect(
    runDrill({ neon: neonFor(api), database: null, now: clock.now, sleep, signal: controller.signal })
  ).rejects.toThrow('restore drill stopped')
  expect([...api.branches.values()]).toEqual(['main'])
})

test('a branch Neon fails to delete is a miss naming its ID', async () => {
  const api = fakeNeon({ failDelete: true })

  const { record, misses } = await runDrill({ neon: neonFor(api), database: null, ...fakeClock() })

  expect(record.deleted).toBe(false)
  expect(misses).toEqual(['branch br-drill (drill-20261106T225000Z) was not deleted'])
})

test('drill branches an earlier run left behind are deleted before the new one is made', async () => {
  const api = fakeNeon({
    branches: [
      { id: 'br-main', name: 'main' },
      { id: 'br-old', name: 'drill-20260801T020000Z' },
      { id: 'br-feature', name: 'preview-drill-notes' }
    ]
  })

  const { record } = await runDrill({ neon: neonFor(api), database: null, ...fakeClock() })

  expect(record.swept).toBe(1)
  expect([...api.branches.values()]).toEqual(['main', 'preview-drill-notes'])
})

test('a restore window that does not reach 10 minutes back fails before any branch is made', async () => {
  const api = fakeNeon({ windowS: 600 })

  await expect(runDrill({ neon: neonFor(api), database: null, ...fakeClock() })).rejects.toThrow(
    "the 600 s restore window doesn't reach 2026-11-06T22:50:00.000Z"
  )
  expect(api.calls.some((call) => call.method === 'POST')).toBe(false)
})

test('the Neon client refuses branches outside drill-* and keeps response bodies out of its errors', async () => {
  const api = fakeNeon()
  const neon = neonFor(api)

  await expect(neon.createDrillBranch('main-copy', new Date(NOW))).rejects.toThrow('refusing branch main-copy')
  await expect(neon.createDrillBranch('main-drill-copy', new Date(NOW))).rejects.toThrow(
    'refusing branch main-drill-copy'
  )
  await expect(neon.deleteDrillBranch({ id: 'br-main', name: 'main' })).rejects.toThrow('refusing branch main')
  await expect(neon.deleteDrillBranch({ id: 'br-gone', name: 'drill-x' })).rejects.toThrow(
    `Neon API DELETE /projects/${PROJECT}/branches/br-gone: 404 no route DELETE /projects/${PROJECT}/branches/br-gone`
  )
  expect(api.calls.filter((call) => call.method !== 'GET').map((call) => call.path)).toEqual([
    `/projects/${PROJECT}/branches/br-gone`
  ])
})

test('the restore-drill job is registered and names the variables it is missing', async () => {
  vi.stubEnv('NEON_PROJECT_ID', '')
  vi.stubEnv('NEON_DRILL_API_KEY', '')
  try {
    await expect(registry.jobs['restore-drill']!([])).rejects.toThrow(
      'restore-drill needs NEON_PROJECT_ID, NEON_DRILL_API_KEY'
    )
  } finally {
    vi.unstubAllEnvs()
  }
})

test('a manual snapshot is a miss, since deleted data would outlive the 6-hour window', async () => {
  const api = fakeNeon({ snapshots: 1 })

  const { record, misses } = await runDrill({ neon: neonFor(api), database: null, ...fakeClock() })

  expect(record).toMatchObject({ snapshots: 1, deleted: true })
  expect(misses).toEqual(['NFR-14: 1 snapshot(s) would keep deleted data past the restore window'])
})
