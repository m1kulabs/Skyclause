import { describe, expect, test } from 'vitest'
import { loadEnv } from '@skyclause/config'

const worker = {
  APP_ENV: 'staging',
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
    expect(loadEnv('web', { APP_ENV: 'test' }).APP_ENV).toBe('test')
  })

  test('refuses an APP_ENV outside dev, staging, production and test', () => {
    expect(() => loadEnv('web', { APP_ENV: 'prod' })).toThrow(/APP_ENV/)
  })

  test('returns the worker variables, with Cloud Run’s PORT defaulting to 8080', () => {
    expect(loadEnv('worker', worker)).toMatchObject({ ...worker, PORT: 8080 })
    expect(loadEnv('worker', { ...worker, PORT: '9000' }).PORT).toBe(9000)
  })

  test('reads LOG_LEVEL, defaulting to info, and refuses an unknown level', () => {
    expect(loadEnv('job', { APP_ENV: 'dev' }).LOG_LEVEL).toBe('info')
    expect(loadEnv('job', { APP_ENV: 'dev', LOG_LEVEL: 'debug' }).LOG_LEVEL).toBe('debug')
    expect(() => loadEnv('job', { APP_ENV: 'dev', LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/)
  })

  test('reads OTEL_SERVICE_NAME and the project and region telemetry exports to, all optional', () => {
    const env = loadEnv('web', {
      APP_ENV: 'production',
      OTEL_SERVICE_NAME: 'web',
      GCP_PROJECT: 'skyclause',
      GCP_REGION: 'asia-southeast1'
    })
    expect(env).toMatchObject({ OTEL_SERVICE_NAME: 'web', GCP_PROJECT: 'skyclause', GCP_REGION: 'asia-southeast1' })
    expect(loadEnv('web', { APP_ENV: 'dev' }).GCP_PROJECT).toBeUndefined()
  })
})
