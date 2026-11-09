// #150: the worker's `expiry-{call_id}` timers on `bundle-timers` (#79 §5, CAL-8) and the Cloud Tasks client they use.
import { createBundle, systemPrincipal, withTenant, type Tx } from '@skyclause/db'
import { bundleScene, callDraft, ledgerOf, runOf, windowOf } from '@skyclause/db/test/bundles/scene'
import { makeOrganization } from '@skyclause/db/test/factories/index'
import { asLogin } from '@skyclause/db/test/harness/index'
import { beforeAll, describe, expect, test, vi } from 'vitest'
import { createBundlesPart } from '../src/bundles'
import { cloudTasks, type TimerTask } from '../src/bundles/cloud-tasks'
import { dispatchEvent } from '../src/events'
import { registry } from '../src/registry'

let orgId: string
beforeAll(async () => {
  orgId = (await makeOrganization()).id
})
const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal: systemPrincipal('test') }, fn)
const at = (iso: string) => new Date(iso)

/** A Storm confirmed bundle in Needs review for two windows ending 15:30 and 15:45 MYT on 2 November. */
async function stormBundle() {
  return inOrg(async (tx) => {
    const scene = await bundleScene(tx)
    const early = await windowOf(tx, scene, at('2026-11-02T07:15:00Z'), at('2026-11-02T07:30:00Z'))
    const late = await windowOf(tx, scene, at('2026-11-02T07:30:00Z'), at('2026-11-02T07:45:00Z'))
    const r = await runOf(tx, scene, at('2026-11-02T07:05:00Z'))
    const fired = [{ clause: 'storm_confirmed', inputs: ['site.rain_60m_mm'] }]
    const made = await createBundle(tx, {
      runId: r.id,
      pack: 'sky',
      draftOnly: false,
      calls: [
        callDraft({ windowId: early.id, mode: 'commute_disruption', fired }),
        callDraft({ windowId: late.id, mode: 'commute_disruption', fired })
      ],
      triggeredAt: r.triggeredAt,
      now: at('2026-11-02T07:10:00Z')
    })
    return { ...made, projectId: scene.projectId }
  })
}

const stateOf = (callId: string) =>
  asLogin('postgres', async (client) => {
    const { rows } = await client.query<{ state: string }>('SELECT state FROM call WHERE id = $1', [callId])
    return rows[0]!.state
  })

describe('the bundle-timers queue', () => {
  test('is registered once, by c-bundle-lifecycle', () => {
    expect(registry.queues['bundle-timers']).toBeTypeOf('function')
  })

  test('expiry-{call_id} expires the call at its time; a replay of the task changes nothing', async () => {
    const made = await stormBundle()
    const part = createBundlesPart(vi.fn(), () => at('2026-11-02T07:30:00Z'))
    const task = {
      name: `expiry-${made.callIds[0]}`,
      retryCount: 0,
      body: { org_id: orgId, project_id: made.projectId, call_id: made.callIds[0] }
    }
    await part.queues!['bundle-timers']!(task)
    await part.queues!['bundle-timers']!({ ...task, retryCount: 1 })
    expect(await stateOf(made.callIds[0]!)).toBe('expired')
    expect(await stateOf(made.callIds[1]!)).toBe('drafted')
    expect((await ledgerOf(made.projectId)).map((entry) => entry.kind)).toEqual(['call_expired'])
  })

  test('an early task fails so Cloud Tasks retries it, and an unknown timer fails', async () => {
    const made = await stormBundle()
    const part = createBundlesPart(vi.fn(), () => at('2026-11-02T07:29:59Z'))
    const body = { org_id: orgId, project_id: made.projectId, call_id: made.callIds[0] }
    await expect(
      part.queues!['bundle-timers']!({ name: `expiry-${made.callIds[0]}`, retryCount: 0, body })
    ).rejects.toThrow(/not due/)
    await expect(part.queues!['bundle-timers']!({ name: 'unknown-1', retryCount: 0, body })).rejects.toThrow(
      /no bundle timer/
    )
    expect(await stateOf(made.callIds[0]!)).toBe('drafted')
  })
})

describe('bundle.needs_review schedules the expiry timers', () => {
  test('one task per call at its expires_at, named expiry-{call_id}; a redelivered event schedules nothing more', async () => {
    const made = await stormBundle()
    const scheduled: TimerTask[] = []
    const part = createBundlesPart(async (task) => void scheduled.push(task))
    const eventId = await asLogin('postgres', async (client) => {
      const { rows } = await client.query<{ id: string }>(
        "SELECT id FROM domain_event WHERE project_id = $1 AND type = 'bundle.needs_review'",
        [made.projectId]
      )
      return rows[0]!.id
    })
    await dispatchEvent(part.events!, eventId)
    await dispatchEvent(part.events!, eventId)
    expect(scheduled.sort((a, b) => a.at.getTime() - b.at.getTime())).toEqual([
      {
        queue: 'bundle-timers',
        name: `expiry-${made.callIds[0]}`,
        at: at('2026-11-02T07:30:00Z'),
        body: { org_id: orgId, project_id: made.projectId, call_id: made.callIds[0] }
      },
      {
        queue: 'bundle-timers',
        name: `expiry-${made.callIds[1]}`,
        at: at('2026-11-02T07:45:00Z'),
        body: { org_id: orgId, project_id: made.projectId, call_id: made.callIds[1] }
      }
    ])
  })
})

describe('cloudTasks', () => {
  const config = () => ({
    project: 'skyclause',
    region: 'asia-southeast1',
    workerUrl: 'https://worker.example.run.app',
    invoker: 'invoker@skyclause.iam.gserviceaccount.com'
  })
  const task: TimerTask = {
    queue: 'bundle-timers',
    name: 'expiry-1',
    at: at('2026-11-02T07:30:00Z'),
    body: { call_id: '1' }
  }

  test('creates an HTTP task at the due time, with the invoker’s OIDC token for the worker', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200 }))
    await cloudTasks({ config, fetch, token: async () => 'token' })(task)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      'https://cloudtasks.googleapis.com/v2/projects/skyclause/locations/asia-southeast1/queues/bundle-timers/tasks'
    )
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token')
    const { task: sent } = JSON.parse(init.body as string)
    expect(sent).toEqual({
      name: 'projects/skyclause/locations/asia-southeast1/queues/bundle-timers/tasks/expiry-1',
      scheduleTime: '2026-11-02T07:30:00.000Z',
      httpRequest: {
        httpMethod: 'POST',
        url: 'https://worker.example.run.app/tasks/bundle-timers',
        headers: { 'Content-Type': 'application/json' },
        body: Buffer.from('{"call_id":"1"}').toString('base64'),
        oidcToken: {
          serviceAccountEmail: 'invoker@skyclause.iam.gserviceaccount.com',
          audience: 'https://worker.example.run.app'
        }
      }
    })
  })

  test('a task that already exists is done; any other failure throws', async () => {
    const exists = vi.fn(async () => new Response('ALREADY_EXISTS', { status: 409 }))
    await expect(cloudTasks({ config, fetch: exists, token: async () => 't' })(task)).resolves.toBeUndefined()
    const down = vi.fn(async () => new Response('backend error', { status: 503 }))
    await expect(cloudTasks({ config, fetch: down, token: async () => 't' })(task)).rejects.toThrow(/503 backend error/)
  })

  test('takes the service account’s token from the metadata server once, until it nears expiry', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.startsWith('http://metadata.google.internal')
        ? Response.json({ access_token: 'from-metadata', expires_in: 3599 })
        : new Response('{}', { status: 200 })
    )
    const schedule = cloudTasks({ config, fetch: fetch as unknown as typeof globalThis.fetch })
    await schedule(task)
    await schedule({ ...task, name: 'expiry-2' })
    const calls = fetch.mock.calls as unknown as Array<[string, RequestInit]>
    expect(calls.filter(([url]) => url.startsWith('http://metadata'))).toHaveLength(1)
    expect((calls[0]![1].headers as Record<string, string>)['Metadata-Flavor']).toBe('Google')
    expect((calls[2]![1].headers as Record<string, string>).authorization).toBe('Bearer from-metadata')
  })
})
