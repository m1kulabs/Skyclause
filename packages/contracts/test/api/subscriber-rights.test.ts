import { expect, test } from 'vitest'
import { getSubscriberData, updateSubscriberData } from '../../src/api/first-party/subscribe'

const dataSchema = (
  getSubscriberData.responses as Record<
    string,
    { content?: Record<string, { schema?: { parse(value: unknown): unknown } }> }
  >
)['200']?.content?.['application/json']?.schema

test('subscriber data contract contains the records the subscriber can export', () => {
  expect(dataSchema).toBeDefined()
  const subscriber = {
    id: 'subscriber-id',
    project_id: 'project-id',
    email: 'reader@example.test',
    role: 'Commuter',
    window_ids: ['window-id'],
    channels: ['email'],
    language: 'en',
    confirmed_at: null
  }
  const parsed = dataSchema!.parse({
    project_name: 'Bukit Jalil',
    subscriber,
    subscriber_status: 'confirmed',
    windows: [
      {
        id: 'window-id',
        title: 'Release wave',
        starts_at: '2026-11-10T01:00:00Z',
        ends_at: '2026-11-10T02:00:00Z',
        kind: 'class',
        tz: 'Asia/Kuala_Lumpur'
      }
    ],
    consent_records: [{ at: '2026-11-01T01:00:00Z', form: 'confirm', notice_version: '2026-11-01', language: 'en' }],
    delivery_history: [
      {
        id: 'notice-id',
        kind: 'call',
        call_id: 'call-id',
        call_permalink: '/c/call-id',
        channel: 'email',
        language: 'en',
        status: 'sent',
        at: '2026-11-02T01:00:00Z',
        accepted_at: '2026-11-02T01:00:00Z'
      }
    ],
    crowd_replies: [
      {
        id: 'reply-id',
        window_id: 'window-id',
        call_id: 'call-id',
        kind: 'keep',
        shift_to: null,
        at: '2026-11-02T01:05:00Z'
      }
    ],
    suppression: null
  }) as Record<string, unknown>

  expect(parsed).toHaveProperty('project_name', 'Bukit Jalil')
  expect(parsed).toHaveProperty('subscriber_status', 'confirmed')
  expect(parsed).toHaveProperty('windows')
  expect(parsed).toHaveProperty('crowd_replies')
  expect(parsed).toHaveProperty('suppression', null)
  expect((parsed.delivery_history as Array<Record<string, unknown>>)[0]).toHaveProperty('call_permalink', '/c/call-id')
  expect((parsed.delivery_history as Array<Record<string, unknown>>)[0]).toHaveProperty('channel', 'email')
})

test('subscriber data corrections accept only address and role', () => {
  const patchSchema = (
    updateSubscriberData.request as unknown as {
      body: { content: { 'application/json': { schema: { safeParse(value: unknown): { success: boolean } } } } }
    }
  ).body.content['application/json'].schema

  expect(patchSchema.safeParse({ email: 'new@example.test' }).success).toBe(true)
  expect(patchSchema.safeParse({ role: 'Organiser' }).success).toBe(true)
  expect(patchSchema.safeParse({ window_ids: ['window-id'] }).success).toBe(false)
  expect(patchSchema.safeParse({ language: 'ms' }).success).toBe(false)
})
