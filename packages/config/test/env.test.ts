import { describe, expect, test } from 'vitest'
import { loadEnv } from '@skyclause/config'

const worker = {
  APP_ENV: 'production',
  WORKER_URL: 'https://worker-413187272599.asia-southeast1.run.app',
  WORKER_INVOKER_SA: 'worker-invoker@skyclause.iam.gserviceaccount.com'
}

describe('loadEnv', () => {
  test('fails the start naming the missing variable', () => {
    const { WORKER_URL: _, ...missing } = worker
    expect(() => loadEnv('worker', missing)).toThrow(/WORKER_URL/)
  })

  test('refuses APP_ENV=test on a Cloud Run service', () => {
    expect(() => loadEnv('worker', { ...worker, APP_ENV: 'test', K_SERVICE: 'worker' })).toThrow(/APP_ENV=test/)
  })

  test('refuses APP_ENV=test in a Cloud Run job', () => {
    expect(() => loadEnv('job', { APP_ENV: 'test', CLOUD_RUN_JOB: 'migrate' })).toThrow(/APP_ENV=test/)
  })

  test('allows APP_ENV=test outside Cloud Run', () => {
    expect(loadEnv('web', { APP_ENV: 'test' })).toEqual({ APP_ENV: 'test' })
  })

  test('refuses an APP_ENV outside dev, production and test, staging included (D44)', () => {
    for (const APP_ENV of ['prod', 'staging']) expect(() => loadEnv('web', { APP_ENV })).toThrow(/APP_ENV/)
  })

  test('returns the worker variables, with Cloud Run’s PORT defaulting to 8080', () => {
    expect(loadEnv('worker', worker)).toEqual({ ...worker, PORT: 8080 })
    expect(loadEnv('worker', { ...worker, PORT: '9000' }).PORT).toBe(9000)
  })
})
