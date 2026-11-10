import { describe, expect, test } from 'vitest'
import { loadEnv } from '@skyclause/config'

const worker = {
  APP_ENV: 'production',
  WORKER_URL: 'https://worker-413187272599.asia-southeast1.run.app',
  WORKER_INVOKER_SA: 'worker-invoker@skyclause.iam.gserviceaccount.com',
  // Shaped like the generated secret, not the real one; the sender hashes addresses with it (#158).
  EMAIL_HASH_KEY: 'e'.repeat(48)
}

// IP_HASH_KEY, EMAIL_HASH_KEY and BETTER_AUTH_SECRET are required on web; shaped like the generated secrets, not the real ones.
const key = { IP_HASH_KEY: 'k'.repeat(48), EMAIL_HASH_KEY: 'e'.repeat(48), BETTER_AUTH_SECRET: 's'.repeat(48) }
const web = { APP_ENV: 'production', ...key }
const origins = {
  MARKETING_ORIGIN: 'https://skyclause.m1ku.tech',
  APP_ORIGIN: 'https://app.skyclause.m1ku.tech',
  API_ORIGIN: 'https://api.skyclause.m1ku.tech',
  MCP_ORIGIN: 'https://mcp.skyclause.m1ku.tech',
  EMBED_ORIGIN: 'https://embed.skyclause.m1ku.tech',
  DOCS_ORIGIN: 'https://docs.skyclause.m1ku.tech'
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
    expect(loadEnv('web', { APP_ENV: 'test', ...key })).toEqual({ APP_ENV: 'test', ...key })
  })

  test('refuses an APP_ENV outside dev, production and test, staging included (D44)', () => {
    for (const APP_ENV of ['prod', 'staging']) expect(() => loadEnv('web', { APP_ENV })).toThrow(/APP_ENV/)
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

  test('the worker needs EMAIL_HASH_KEY and reads the notice origins', () => {
    const { EMAIL_HASH_KEY: _, ...missing } = worker
    expect(() => loadEnv('worker', missing)).toThrow(/EMAIL_HASH_KEY/)
    const links = { APP_ORIGIN: origins.APP_ORIGIN, MARKETING_ORIGIN: origins.MARKETING_ORIGIN }
    expect(loadEnv('worker', { ...worker, ...links })).toMatchObject(links)
  })

  test('the email variables are optional until gate 4B, then read together', () => {
    expect(loadEnv('worker', worker)).not.toHaveProperty('SES_REGION')
    expect(loadEnv('worker', { ...worker, ...email, ...inbound })).toEqual({
      ...worker,
      ...email,
      ...inbound,
      PORT: 8080
    })
    expect(loadEnv('web', { ...web, ...email })).toEqual({ ...web, ...email })
  })

  test('a partial email set fails the start naming what is missing', () => {
    const { AWS_ROLE_ARN: _, ...partial } = email
    expect(() => loadEnv('web', { ...web, ...partial })).toThrow(/AWS_ROLE_ARN/)
    expect(() => loadEnv('worker', { ...worker, ...email })).toThrow(/INBOUND_SNS_TOPIC_ARN/)
  })

  test('refuses an AWS_ROLE_ARN or topic that is not an ARN', () => {
    expect(() => loadEnv('web', { ...web, ...email, AWS_ROLE_ARN: 'skyclause-production-email' })).toThrow(
      /AWS_ROLE_ARN/
    )
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
    expect(loadEnv('web', { ...web, ...publicOnly })).toEqual({ ...web, ...publicOnly })
    expect(() => loadEnv('web', { ...web, VAPID_PUBLIC_KEY: 'not-a-key' })).toThrow(/VAPID_PUBLIC_KEY/)
    expect(() => loadEnv('worker', { ...worker, ...vapid, VAPID_PRIVATE_KEY: 'short' })).toThrow(/VAPID_PRIVATE_KEY/)
  })

  test('a job reads GCP_PROJECT', () => {
    expect(loadEnv('job', { APP_ENV: 'production', GCP_PROJECT: 'skyclause' })).toEqual({
      APP_ENV: 'production',
      GCP_PROJECT: 'skyclause'
    })
  })

  test('reads LOG_LEVEL, optional, and refuses an unknown level', () => {
    expect(loadEnv('job', { APP_ENV: 'dev' }).LOG_LEVEL).toBeUndefined()
    expect(loadEnv('job', { APP_ENV: 'dev', LOG_LEVEL: 'debug' }).LOG_LEVEL).toBe('debug')
    expect(() => loadEnv('job', { APP_ENV: 'dev', LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/)
  })

  test('reads OTEL_SERVICE_NAME and the project and region telemetry exports to, all optional', () => {
    const env = loadEnv('web', {
      ...web,
      OTEL_SERVICE_NAME: 'web',
      GCP_PROJECT: 'skyclause',
      GCP_REGION: 'asia-southeast1'
    })
    expect(env).toMatchObject({ OTEL_SERVICE_NAME: 'web', GCP_PROJECT: 'skyclause', GCP_REGION: 'asia-southeast1' })
    expect(loadEnv('web', { APP_ENV: 'dev', ...key }).GCP_PROJECT).toBeUndefined()
  })

  test('web reads HOST_MODE and the six origins; multi needs all six (spec §4 Hosts)', () => {
    expect(loadEnv('web', { APP_ENV: 'dev', ...key }).HOST_MODE).toBeUndefined()
    expect(loadEnv('web', { ...web, HOST_MODE: 'multi', ...origins })).toEqual({
      ...web,
      HOST_MODE: 'multi',
      ...origins
    })
    expect(loadEnv('web', { ...web, HOST_MODE: 'single', APP_ORIGIN: origins.APP_ORIGIN }).APP_ORIGIN).toBe(
      origins.APP_ORIGIN
    )
    const { EMBED_ORIGIN: _, ...five } = origins
    expect(() => loadEnv('web', { ...web, HOST_MODE: 'multi', ...five })).toThrow(
      /EMBED_ORIGIN: required when HOST_MODE is multi/
    )
    expect(() => loadEnv('web', { ...web, HOST_MODE: 'both' })).toThrow(/HOST_MODE/)
    expect(() => loadEnv('web', { ...web, APP_ORIGIN: 'app.skyclause.m1ku.tech' })).toThrow(/APP_ORIGIN/)
  })

  test('web needs IP_HASH_KEY of at least 32 characters, in every environment', () => {
    for (const APP_ENV of ['dev', 'test', 'production']) {
      expect(() => loadEnv('web', { APP_ENV }), APP_ENV).toThrow(/IP_HASH_KEY/)
    }
    expect(() => loadEnv('web', { ...web, IP_HASH_KEY: 'short' })).toThrow(/IP_HASH_KEY/)
  })

  test('web needs EMAIL_HASH_KEY of at least 32 characters, in every environment', () => {
    for (const APP_ENV of ['dev', 'test', 'production']) {
      expect(() => loadEnv('web', { APP_ENV, IP_HASH_KEY: key.IP_HASH_KEY }), APP_ENV).toThrow(/EMAIL_HASH_KEY/)
    }
    expect(() => loadEnv('web', { ...web, EMAIL_HASH_KEY: 'short' })).toThrow(/EMAIL_HASH_KEY/)
  })

  test('web needs BETTER_AUTH_SECRET of at least 32 characters; SKYCLAUSE_STAFF_EMAILS is optional (#94)', () => {
    const { BETTER_AUTH_SECRET: _, ...missing } = web
    expect(() => loadEnv('web', missing)).toThrow(/BETTER_AUTH_SECRET/)
    expect(() => loadEnv('web', { ...web, BETTER_AUTH_SECRET: 'short' })).toThrow(/BETTER_AUTH_SECRET/)
    expect(loadEnv('web', web).SKYCLAUSE_STAFF_EMAILS).toBeUndefined()
    const staff = 'a@example.org,b@example.org'
    expect(loadEnv('web', { ...web, SKYCLAUSE_STAFF_EMAILS: staff }).SKYCLAUSE_STAFF_EMAILS).toBe(staff)
  })
})

test('worker preserves optional staff addresses without requiring the auth secret', () => {
  expect(loadEnv('worker', worker)).not.toHaveProperty('SKYCLAUSE_STAFF_EMAILS')
  expect(loadEnv('worker', { ...worker, SKYCLAUSE_STAFF_EMAILS: 'a@example.org, b@example.org' })).toMatchObject({
    SKYCLAUSE_STAFF_EMAILS: 'a@example.org, b@example.org'
  })
})
