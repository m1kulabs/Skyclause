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
    expect(loadEnv('web', { APP_ENV: 'test' })).toEqual({ APP_ENV: 'test' })
  })

  test('refuses an APP_ENV outside dev, staging, production and test', () => {
    expect(() => loadEnv('web', { APP_ENV: 'prod' })).toThrow(/APP_ENV/)
  })

  test('returns the worker variables, with Cloud Run’s PORT defaulting to 8080', () => {
    expect(loadEnv('worker', worker)).toEqual({ ...worker, PORT: 8080 })
    expect(loadEnv('worker', { ...worker, PORT: '9000' }).PORT).toBe(9000)
  })

  // Set from infra/aws's app_config output once gate 4B is done; until then none is set.
  const email = {
    SES_REGION: 'ap-southeast-2',
    SES_CONFIGURATION_SET: 'skyclause-production',
    EMAIL_FROM_AUTH: 'Skyclause <sign-in@notices.skyclause.m1ku.tech>',
    EMAIL_FROM_NOTICES: 'Skyclause <notices@notices.skyclause.m1ku.tech>',
    AWS_ROLE_ARN: 'arn:aws:iam::776566309118:role/skyclause-production-email'
  }
  const inbound = {
    SES_EVENTS_SNS_TOPIC_ARN: 'arn:aws:sns:ap-southeast-2:776566309118:skyclause-production-ses-events',
    INBOUND_DOMAIN: 'in.skyclause.m1ku.tech',
    INBOUND_BUCKET: 'skyclause-production-inbound-776566309118',
    INBOUND_SNS_TOPIC_ARN: 'arn:aws:sns:ap-southeast-2:776566309118:skyclause-production-inbound'
  }

  test('the email variables are optional until gate 4B, then read together', () => {
    expect(loadEnv('worker', worker)).not.toHaveProperty('SES_REGION')
    expect(loadEnv('worker', { ...worker, ...email, ...inbound })).toEqual({
      ...worker,
      ...email,
      ...inbound,
      PORT: 8080
    })
    expect(loadEnv('web', { APP_ENV: 'production', ...email })).toEqual({ APP_ENV: 'production', ...email })
  })

  test('a partial email set fails the start naming what is missing', () => {
    const { AWS_ROLE_ARN: _, ...partial } = email
    expect(() => loadEnv('web', { APP_ENV: 'production', ...partial })).toThrow(/AWS_ROLE_ARN/)
    expect(() => loadEnv('worker', { ...worker, ...email })).toThrow(/INBOUND_SNS_TOPIC_ARN/)
  })

  test('refuses an AWS_ROLE_ARN or topic that is not an ARN', () => {
    expect(() =>
      loadEnv('web', { APP_ENV: 'production', ...email, AWS_ROLE_ARN: 'skyclause-production-email' })
    ).toThrow(/AWS_ROLE_ARN/)
    expect(() => loadEnv('worker', { ...worker, ...email, ...inbound, INBOUND_SNS_TOPIC_ARN: 'inbound' })).toThrow(
      /INBOUND_SNS_TOPIC_ARN/
    )
  })

  test('reads the VAPID values once the vapid-keys job has made them, and checks their encoding', () => {
    const vapid = {
      VAPID_SUBJECT: 'https://app.skyclause.m1ku.tech',
      // Shaped like web push's base64url keys (a 65-byte 0x04 point, a 32-byte scalar), not real ones.
      VAPID_PUBLIC_KEY: `B${'A'.repeat(86)}`,
      VAPID_PRIVATE_KEY: 'A'.repeat(43)
    }
    expect(loadEnv('worker', { ...worker, ...vapid })).toMatchObject(vapid)
    const { VAPID_PRIVATE_KEY: _, ...publicOnly } = vapid
    expect(loadEnv('web', { APP_ENV: 'production', ...publicOnly })).toEqual({ APP_ENV: 'production', ...publicOnly })
    expect(() => loadEnv('web', { APP_ENV: 'production', VAPID_PUBLIC_KEY: 'not-a-key' })).toThrow(/VAPID_PUBLIC_KEY/)
    expect(() => loadEnv('worker', { ...worker, ...vapid, VAPID_PRIVATE_KEY: 'short' })).toThrow(/VAPID_PRIVATE_KEY/)
  })

  test('a job reads GCP_PROJECT', () => {
    expect(loadEnv('job', { APP_ENV: 'production', GCP_PROJECT: 'skyclause' })).toEqual({
      APP_ENV: 'production',
      GCP_PROJECT: 'skyclause'
    })
  })
})
