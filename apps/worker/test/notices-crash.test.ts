// #158, TRD "Channels and sends": a crash after SES accepted a notice but before the outbox recorded it repeats at
// most that one email, under the same idempotency key, and the first email's links keep working. The crash is the
// record failing once after the provider call.
import { verifySubscriberToken } from '@skyclause/db'
import { makeOrganization } from '@skyclause/db/test/factories/index'
import { beforeAll, expect, test, vi } from 'vitest'
import { approvedCall, at, mailbox, noticeRow, senderPart, stateOf, unsubscribeToken } from './notices-scene'

const crash = vi.hoisted(() => ({ next: false }))
vi.mock('@skyclause/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@skyclause/db')>()
  return {
    ...actual,
    recordCallNotice: async (...args: Parameters<typeof actual.recordCallNotice>) => {
      if (crash.next && args[2].status === 'sent') {
        crash.next = false
        throw new Error('the worker stopped after SES accepted the email')
      }
      return actual.recordCallNotice(...args)
    }
  }
})

let orgId: string
beforeAll(async () => {
  vi.stubEnv('EMAIL_HASH_KEY', 'notices-test-email-hash-key-000000000000')
  orgId = (await makeOrganization()).id
})

test('a crash after the provider call repeats one email under the same key, once its lease lapses', async () => {
  const made = await approvedCall(orgId, { recipients: [{}] })
  const box = mailbox()
  const { approve, sweep, clock } = senderPart(box)
  crash.next = true
  await expect(approve(made.event)).rejects.toThrow(/stopped after SES accepted/)
  expect(box.sent).toHaveLength(1)
  const id = made.subscribers[0]!.noticeId
  expect(await noticeRow(id)).toMatchObject({ status: 'queued', attempts: 1 })

  clock.now = at('2026-11-02T07:20:00Z') // the lease still holds
  await sweep()
  expect(box.sent).toHaveLength(1)

  clock.now = at('2026-11-02T07:26:00Z') // the lease lapsed 15 minutes after the claim: the next batch retries it
  await sweep()
  await sweep()
  expect(box.sent.map((m) => m.idempotencyKey)).toEqual([
    made.subscribers[0]!.idempotencyKey,
    made.subscribers[0]!.idempotencyKey
  ])
  expect(await noticeRow(id)).toMatchObject({ status: 'sent', attempts: 2 })
  expect(await stateOf('call', made.callId)).toBe('sent')
  // The tokens were committed with the claim, so the first email's one-click link still works.
  expect(await verifySubscriberToken(unsubscribeToken(box.sent[0]!), 'unsubscribe')).toMatchObject({
    subscriberId: made.subscribers[0]!.id
  })
})
