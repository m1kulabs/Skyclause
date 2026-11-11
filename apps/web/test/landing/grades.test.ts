import { describe, expect, test, vi } from 'vitest'
import { pilotRefFromEnv, readGrades } from '../../features/landing/grades'

const baseEnv = {
  APP_ENV: 'test',
  IP_HASH_KEY: 'k'.repeat(48),
  EMAIL_HASH_KEY: 'e'.repeat(48),
  BETTER_AUTH_SECRET: 's'.repeat(48)
}

describe('grades read', () => {
  test('unset or empty PILOT_PROJECT reads n=0 without fetching', async () => {
    const fetcher = vi.fn()
    expect(await readGrades(fetcher as never, { ...baseEnv, PILOT_PROJECT: '' })).toEqual({ kind: 'empty', n: 0 })
    expect(await readGrades(fetcher as never, { ...baseEnv })).toEqual({ kind: 'empty', n: 0 })
    expect(fetcher).not.toHaveBeenCalled()
  })

  test('shows n and Wilson interval when grades exist', async () => {
    const fetcher = vi.fn(async () =>
      (await import('../../features/landing/grades'))
        ? {
            ok: true,
            status: 200,
            json: async () => ({ data: [{ n: 8, x: 7, low: 0.53, high: 0.98, metric: 'precision' }] })
          }
        : null
    ) as never
    const state = await readGrades(fetcher, {
      ...baseEnv,
      PILOT_PROJECT: 'commons/bukit-jalil',
      API_ORIGIN: 'https://api.example'
    })
    expect(state).toEqual({ kind: 'grades', n: 8, x: 7, low: 0.53, high: 0.98, metric: 'precision' })
  })

  test('a failed read shows its error', async () => {
    const fetcher = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })) as never
    const state = await readGrades(fetcher, { ...baseEnv, PILOT_PROJECT: 'commons/bukit-jalil' })
    expect(state.kind).toBe('error')
    expect(state.kind === 'error' && state.message).toContain('503')
    const throwing = vi.fn(async () => {
      throw new Error('network down')
    }) as never
    expect(await readGrades(throwing, { ...baseEnv, PILOT_PROJECT: 'commons/bukit-jalil' })).toEqual({
      kind: 'error',
      message: 'network down'
    })
  })

  test('pilot ref parses {org}/{project}', () => {
    expect(pilotRefFromEnv({ ...baseEnv, PILOT_PROJECT: 'commons/bukit-jalil' })).toEqual({
      org: 'commons',
      project: 'bukit-jalil'
    })
    expect(pilotRefFromEnv({ ...baseEnv, PILOT_PROJECT: '' })).toBeNull()
    expect(pilotRefFromEnv({ ...baseEnv })).toBeNull()
  })
})
