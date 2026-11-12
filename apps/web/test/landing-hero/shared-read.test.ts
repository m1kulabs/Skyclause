import { afterEach, describe, expect, test, vi } from 'vitest'
import { readGrades } from '../../features/landing/grades'
import { readHero } from '../../features/landing-hero/read'
import { sharedReads } from '../../features/landing-hero/shared-read'

const baseEnv = {
  APP_ENV: 'test',
  IP_HASH_KEY: 'k'.repeat(48),
  EMAIL_HASH_KEY: 'e'.repeat(48),
  BETTER_AUTH_SECRET: 's'.repeat(48),
  PILOT_PROJECT: 'commons/bukit-jalil'
}

const reply = (status: number, body: unknown = {}) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

/** A stand-in for the API: each path's answer, every request it was sent, and what each carried. */
function api(answers: Record<string, () => Promise<Response>>) {
  const sent: Array<{ path: string; init: RequestInit | undefined }> = []
  const fetcher = vi.fn((url: string, init?: RequestInit) => {
    const path = new URL(url).pathname
    sent.push({ path, init })
    const answer = Object.entries(answers).find(([suffix]) => path.endsWith(suffix))?.[1]
    // Slow enough that every caller below arrives while the first request is in flight.
    return new Promise<Response>((resolve) => setTimeout(() => resolve(answer ? answer() : reply(404)), 5))
  })
  const count = (suffix: string) => sent.filter((request) => request.path.endsWith(suffix)).length
  return { fetcher: fetcher as unknown as typeof fetch, sent, count }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('shared reads', () => {
  test('callers share one load while it is in flight, and its answer while it is fresh', async () => {
    let clock = 0
    const reads = sharedReads(() => clock)
    const load = vi.fn(() => new Promise<string>((resolve) => setTimeout(() => resolve('answer'), 5)))
    const answers = await Promise.all(Array.from({ length: 50 }, () => reads.read('status', load, () => 30_000)))
    expect(new Set(answers)).toEqual(new Set(['answer']))
    expect(load).toHaveBeenCalledTimes(1)
    clock = 29_999
    await reads.read('status', load, () => 30_000)
    expect(load).toHaveBeenCalledTimes(1)
    clock = 30_000
    await reads.read('status', load, () => 30_000)
    expect(load).toHaveBeenCalledTimes(2)
  })

  test('a failed load is not kept, so the next caller asks again', async () => {
    const reads = sharedReads(() => 0)
    const load = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce('answer')
    await expect(reads.read('grades', load, () => 30_000)).rejects.toThrow('down')
    await expect(reads.read('grades', load, () => 30_000)).resolves.toBe('answer')
  })

  test('the store stays bounded however many windows are asked for', async () => {
    const reads = sharedReads(() => 0, 3)
    for (const key of ['a', 'b', 'c', 'd', 'e'])
      await reads.read(
        key,
        async () => key,
        () => 30_000
      )
    const load = vi.fn(async () => 'again')
    // The oldest went first; the newest are kept.
    await reads.read('a', load, () => 30_000)
    await reads.read('e', load, () => 30_000)
    expect(load).toHaveBeenCalledTimes(1)
  })
})

describe('the landing’s server reads', () => {
  test('50 page views at once send one request per distinct read, with no credential or cookie', async () => {
    vi.stubEnv('PILOT_PROJECT', 'commons/bukit-jalil')
    const verdict = {
      label: 'Clause engine verdict: not reviewed, not sent',
      evaluated_at: '',
      verdicts: [],
      strip: []
    }
    const { fetcher, sent, count } = api({
      '/evaluate': () => reply(200, verdict),
      '/status': () => reply(200, { packs: [], strip: [] }),
      '/calendar-entries': () => reply(200, { data: [] })
    })
    vi.stubGlobal('fetch', fetcher)
    const reads = await Promise.all(Array.from({ length: 50 }, () => readHero({})))
    expect(reads.every((read) => read.result.kind === 'ok')).toBe(true)
    expect([count('/evaluate'), count('/status'), count('/calendar-entries')]).toEqual([1, 1, 1])
    for (const { init } of sent) {
      const headers = new Headers(init?.headers)
      expect(headers.has('cookie')).toBe(false)
      expect(headers.has('authorization')).toBe(false)
      expect(init?.credentials).not.toBe('include')
    }
  })

  test('a verdict read that answered 501 is remembered: no page view in the next minute asks for any window', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-13T02:00:00.000Z') })
    const { fetcher, count } = api({
      '/evaluate': () => reply(501, { title: 'Not built' }),
      '/status': () => reply(501)
    })
    vi.stubGlobal('fetch', fetcher)
    expect((await readHero({})).result).toEqual({ kind: 'unavailable' })
    const other = await readHero({ date: '2026-11-14', start: '15:30', end: '17:00' })
    expect(other.result).toEqual({ kind: 'unavailable' })
    expect([count('/evaluate'), count('/status')]).toEqual([1, 1])
    vi.setSystemTime(new Date('2026-11-13T02:00:59.000Z'))
    await readHero({ date: '2026-11-15', start: '09:00', end: '10:00' })
    expect(count('/evaluate')).toBe(1)
    vi.setSystemTime(new Date('2026-11-13T02:01:01.000Z'))
    await readHero({})
    expect([count('/evaluate'), count('/status')]).toEqual([2, 2])
  })

  test('a 503 is shared for two seconds at most, then asked again', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-13T02:00:00.000Z') })
    const { fetcher, count } = api({ '/evaluate': () => reply(503), '/status': () => reply(503) })
    vi.stubGlobal('fetch', fetcher)
    const first = await readHero({})
    expect(first.result.kind).toBe('error')
    expect(first.status).toEqual({ kind: 'error', status: 503 })
    vi.setSystemTime(new Date('2026-11-13T02:00:01.500Z'))
    await readHero({})
    expect(count('/evaluate')).toBe(1)
    vi.setSystemTime(new Date('2026-11-13T02:00:02.500Z'))
    expect((await readHero({})).result.kind).toBe('error')
    expect([count('/evaluate'), count('/status')]).toEqual([2, 2])
  })

  test('the grades: one request for 50 views; a 501 kept a minute; a 503 asked again after two seconds', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-13T02:00:00.000Z') })
    const built = api({
      '/grades': () => reply(200, { data: [{ n: 8, x: 7, low: 0.53, high: 0.98, metric: 'precision' }] })
    })
    const states = await Promise.all(Array.from({ length: 50 }, () => readGrades(built.fetcher, baseEnv)))
    expect(states.every((state) => state.kind === 'grades')).toBe(true)
    expect(built.count('/grades')).toBe(1)

    const notBuilt = api({ '/grades': () => reply(501) })
    expect(await readGrades(notBuilt.fetcher, baseEnv)).toEqual({ kind: 'not_built' })
    vi.setSystemTime(new Date('2026-11-13T02:00:59.000Z'))
    expect(await readGrades(notBuilt.fetcher, baseEnv)).toEqual({ kind: 'not_built' })
    expect(notBuilt.count('/grades')).toBe(1)

    const failing = api({ '/grades': () => reply(503) })
    expect((await readGrades(failing.fetcher, baseEnv)).kind).toBe('error')
    vi.setSystemTime(new Date('2026-11-13T02:01:02.000Z'))
    expect((await readGrades(failing.fetcher, baseEnv)).kind).toBe('error')
    expect(failing.count('/grades')).toBe(2)
  })
})
