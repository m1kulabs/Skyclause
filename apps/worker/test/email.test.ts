import { createLocalJWKSet } from 'jose'
import { describe, expect, test } from 'vitest'
import { createServer, defineRegistry } from '../src/server'
import { createEmailPart } from '../src/email'

const base = {
  APP_ENV: 'production' as const,
  WORKER_URL: 'https://worker-413187272599.asia-southeast1.run.app',
  WORKER_INVOKER_SA: 'skyclause-invoker@skyclause.iam.gserviceaccount.com',
  PORT: 8080
}

function app(env: Parameters<typeof createEmailPart>[0]) {
  return createServer({
    registry: defineRegistry([createEmailPart(env)]),
    audience: base.WORKER_URL,
    invoker: base.WORKER_INVOKER_SA,
    jwks: createLocalJWKSet({ keys: [] }),
    heartbeat: () => {}
  })
}

describe('worker email part', () => {
  test('registers the vapid-keys job', () => {
    expect(Object.keys(defineRegistry([createEmailPart(() => base)]).jobs)).toEqual(['vapid-keys'])
  })

  test('is served without Google OIDC and answers 503 until infra/aws values are set', async () => {
    const res = await app(() => base).request('/ses/inbound', { method: 'POST', body: '{}' })
    expect(res.status).toBe(503)
  })

  test('with the values set, an unsigned body is refused by the SNS check', async () => {
    const res = await app(() => ({
      ...base,
      SES_REGION: 'ap-southeast-2',
      AWS_ROLE_ARN: 'arn:aws:iam::776566309118:role/skyclause-production-email',
      INBOUND_BUCKET: 'skyclause-production-inbound-776566309118',
      INBOUND_SNS_TOPIC_ARN: 'arn:aws:sns:ap-southeast-2:776566309118:skyclause-production-inbound'
    })).request('/ses/inbound', { method: 'POST', body: JSON.stringify({ Type: 'Notification' }) })
    expect(res.status).toBe(403)
  })
})
