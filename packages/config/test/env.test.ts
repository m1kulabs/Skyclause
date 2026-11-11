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

  // Resend sending: the key is a Secret Manager secret (shaped like one, not real), the senders Terraform's.
  const email = {
    RESEND_SENDING_API_KEY: 're_test_sending_only',
    EMAIL_FROM_AUTH: 'Skyclause <sign-in@notices.skyclause.m1ku.tech>',
    EMAIL_FROM_NOTICES: 'Skyclause <notices@notices.skyclause.m1ku.tech>'
  }
  // The worker's Resend receiving settings: the full-access key and the webhook's signing secret are Secret Manager
  // secrets (shaped like Resend's, not real ones), the domain Terraform's.
  const inbound = {
    RESEND_RECEIVING_API_KEY: 're_test_full_access',
    // A 24-byte key, the least the schema takes.
    RESEND_WEBHOOK_SECRET: `whsec_${Buffer.from('skyclause env test value').toString('base64')}`,
    INBOUND_DOMAIN: 'in.skyclause.m1ku.tech'
  }

  test('the worker needs EMAIL_HASH_KEY and reads the notice origins', () => {
    const { EMAIL_HASH_KEY: _, ...missing } = worker
    expect(() => loadEnv('worker', missing)).toThrow(/EMAIL_HASH_KEY/)
    const links = { APP_ORIGIN: origins.APP_ORIGIN, MARKETING_ORIGIN: origins.MARKETING_ORIGIN }
    expect(loadEnv('worker', { ...worker, ...links })).toMatchObject(links)
  })

  test('the sending and receiving variables are optional, and each group is read together', () => {
    expect(loadEnv('worker', worker)).not.toHaveProperty('RESEND_SENDING_API_KEY')
    expect(loadEnv('worker', worker)).not.toHaveProperty('RESEND_RECEIVING_API_KEY')
    expect(loadEnv('worker', { ...worker, ...email, ...inbound })).toEqual({
      ...worker,
      ...email,
      ...inbound,
      PORT: 8080
    })
    expect(loadEnv('worker', { ...worker, ...email })).toEqual({ ...worker, ...email, PORT: 8080 })
    expect(loadEnv('worker', { ...worker, ...inbound })).toEqual({ ...worker, ...inbound, PORT: 8080 })
    expect(loadEnv('web', { ...web, ...email })).toEqual({ ...web, ...email })
  })

  test('the receiving variables are the worker’s only: web takes none of them', () => {
    expect(loadEnv('web', { ...web, ...email, ...inbound })).toEqual({ ...web, ...email })
  })

  test('a partial email set fails the start naming what is missing', () => {
    const { RESEND_SENDING_API_KEY: _, ...noKey } = email
    expect(() => loadEnv('web', { ...web, ...noKey })).toThrow(/RESEND_SENDING_API_KEY/)
    expect(() => loadEnv('worker', { ...worker, ...noKey, ...inbound })).toThrow(/RESEND_SENDING_API_KEY/)
    for (const name of Object.keys(inbound)) {
      const partial = Object.fromEntries(Object.entries(inbound).filter(([other]) => other !== name))
      expect(() => loadEnv('worker', { ...worker, ...email, ...partial }), name).toThrow(new RegExp(name))
    }
  })

  test('refuses a Resend key that is not one', () => {
    for (const RESEND_SENDING_API_KEY of ['skyclause-production', 're_test_sending_only\n', 'whsec_test']) {
      expect(() => loadEnv('web', { ...web, ...email, RESEND_SENDING_API_KEY })).toThrow(/RESEND_SENDING_API_KEY/)
    }
    for (const RESEND_RECEIVING_API_KEY of ['skyclause-production', 're_test_full_access\n', 'whsec_test']) {
      expect(() => loadEnv('worker', { ...worker, ...inbound, RESEND_RECEIVING_API_KEY })).toThrow(
        /RESEND_RECEIVING_API_KEY/
      )
    }
  })

  test('refuses a webhook secret that is not a whsec_ one', () => {
    for (const RESEND_WEBHOOK_SECRET of ['plJ3nmyCDGBKInavdOK15jsl', 're_test_sending_only', 'whsec_', 'whsec_a b']) {
      expect(() => loadEnv('worker', { ...worker, ...inbound, RESEND_WEBHOOK_SECRET }), RESEND_WEBHOOK_SECRET).toThrow(
        /RESEND_WEBHOOK_SECRET/
      )
    }
  })

  test('refuses a webhook secret whose HMAC key is under 24 bytes', () => {
    // `whsec_A` decodes to no byte at all, so anyone could sign with the empty key.
    const short = ['whsec_A', `whsec_${Buffer.alloc(23, 7).toString('base64')}`]
    for (const RESEND_WEBHOOK_SECRET of short) {
      expect(() => loadEnv('worker', { ...worker, ...inbound, RESEND_WEBHOOK_SECRET }), RESEND_WEBHOOK_SECRET).toThrow(
        /RESEND_WEBHOOK_SECRET/
      )
    }
    const RESEND_WEBHOOK_SECRET = `whsec_${Buffer.alloc(24, 7).toString('base64')}`
    expect(loadEnv('worker', { ...worker, ...inbound, RESEND_WEBHOOK_SECRET }).RESEND_WEBHOOK_SECRET).toBe(
      RESEND_WEBHOOK_SECRET
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

  test('Google OAuth client ID and secret are optional until configured, then required as a pair (#97)', () => {
    expect(loadEnv('web', web)).not.toHaveProperty('GOOGLE_CLIENT_ID')
    const google = { GOOGLE_CLIENT_ID: 'client.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'secret' }
    expect(loadEnv('web', { ...web, ...google })).toMatchObject(google)
    expect(() => loadEnv('web', { ...web, GOOGLE_CLIENT_ID: google.GOOGLE_CLIENT_ID })).toThrow(/GOOGLE_CLIENT_SECRET/)
    expect(() => loadEnv('web', { ...web, GOOGLE_CLIENT_SECRET: google.GOOGLE_CLIENT_SECRET })).toThrow(
      /GOOGLE_CLIENT_ID/
    )
  })
})

test('worker preserves optional staff addresses without requiring the auth secret', () => {
  expect(loadEnv('worker', worker)).not.toHaveProperty('SKYCLAUSE_STAFF_EMAILS')
  expect(loadEnv('worker', { ...worker, SKYCLAUSE_STAFF_EMAILS: 'a@example.org, b@example.org' })).toMatchObject({
    SKYCLAUSE_STAFF_EMAILS: 'a@example.org, b@example.org'
  })
})
