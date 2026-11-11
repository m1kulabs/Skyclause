// #157 (c-subscribers) at the operation seam: the `/v1` subscriber routes and `/api/subscribe/{token}`, on the #79 §7
// test database, with the mailbox double as `EmailTransport` and #110's `eraseSubscriber` as a double.
import { randomUUID } from 'node:crypto'
import { Problem, type EmailTransport, type Principal } from '@skyclause/contracts'
import {
  analyticsEvent,
  consentRecord,
  emailHash,
  issueSubscriberToken,
  notice,
  recordAudit,
  subscriber,
  subscriberToken,
  suppression,
  systemPrincipal,
  withSystem,
  withTenant,
  type Tx
} from '@skyclause/db'
import { makeOrganization, makeProject, makeSubscriber, makeWindow } from '@skyclause/db/test/factories/index'
import { and, asc, eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  apiRequest,
  asDevice,
  asSession,
  createMailbox,
  createTestApi,
  crossOrgCase,
  TEST_APP_ORIGIN,
  testDeps,
  testOrg
} from './harness'

const legal = vi.hoisted(() => ({ version: '2026-11-01' as string | null }))
vi.mock('@skyclause/contracts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@skyclause/contracts')>()
  return {
    ...actual,
    get PRIVACY_NOTICE_VERSION() {
      return legal.version
    },
    consentWriteProblem: () =>
      legal.version === null ? { slug: 'privacy-notice-unpublished' as const, status: 503 as const } : null
  }
})
const erased = vi.hoisted(() => [] as string[])
vi.mock('@skyclause/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@skyclause/db')>()
  return {
    ...actual,
    eraseSubscriber: async (_tx: unknown, id: string) => {
      erased.push(id)
    }
  }
})

const KEY = 'test-only-email-hash-key-0123456789abcdef'
const acme = testOrg(`acme-${randomUUID()}`)
const other = testOrg(`other-${randomUUID()}`)
const admin = asSession({ org: acme.slug, role: 'admin' })
const TOKEN = /\/subscribe\/([A-Za-z0-9_-]{43})/

const inOrg = <T>(orgId: string, fn: (tx: Tx) => Promise<T>) =>
  withTenant({ orgId, principal: systemPrincipal('test') }, fn)

let projectId: string
let windowId: string

beforeAll(async () => {
  await makeOrganization({ id: acme.id, slug: acme.slug })
  await makeOrganization({ id: other.id, slug: other.slug })
})
beforeEach(async () => {
  vi.stubEnv('EMAIL_HASH_KEY', KEY)
  legal.version = '2026-11-01'
  ;({ projectId, windowId } = await inOrg(acme.id, async (tx) => {
    const project = await makeProject(tx, { name: 'Bukit Jalil' })
    const open = await makeWindow(tx, {
      projectId: project.id,
      startsAt: new Date(Date.now() + 86_400_000),
      endsAt: new Date(Date.now() + 90_000_000)
    })
    return { projectId: project.id, windowId: open.id }
  }))
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function setup(o: { email?: EmailTransport } = {}) {
  const mailbox = createMailbox()
  const deps = testDeps({ withTenant, recordAudit, email: o.email ?? mailbox })
  return { ...createTestApi({ deps }), mailbox }
}

const fields = (email: string) => ({
  email,
  role: 'Lecturer',
  window_ids: [windowId],
  channels: ['email' as const],
  language: 'en' as const
})
const join = (app: ReturnType<typeof setup>['api'], token: string, email: string, extra = {}) =>
  apiRequest(app, {
    method: 'POST',
    path: `/api/subscribe/${token}`,
    idempotencyKey: randomUUID(),
    body: { ...fields(email), consent: true, notice_version: '2026-11-01', ...extra }
  })
const tokenIn = (text: string) => TOKEN.exec(text)![1]!

async function subscribeLink(app: ReturnType<typeof setup>['v1']) {
  const response = await apiRequest(app, {
    as: admin,
    org: acme.slug,
    method: 'POST',
    path: `/v1/projects/${projectId}/subscribe-link`,
    idempotencyKey: randomUUID()
  })
  expect(response.status).toBe(201)
  const body = (await response.json()) as { id: string; project_id: string; url: string }
  return { ...body, token: tokenIn(body.url) }
}

const rows = <T>(fn: (tx: Tx) => Promise<T>) => inOrg(acme.id, fn)
const noticesOf = (subscriberId: string) =>
  rows((tx) => tx.select().from(notice).where(eq(notice.subscriberId, subscriberId)).orderBy(asc(notice.createdAt)))
const suppressionsOf = (address: string) =>
  rows((tx) =>
    tx
      .select()
      .from(suppression)
      .where(eq(suppression.emailHash, emailHash(address)))
  )
const consentsOf = (subscriberId: string) =>
  rows((tx) =>
    tx.select().from(consentRecord).where(eq(consentRecord.subscriberId, subscriberId)).orderBy(asc(consentRecord.at))
  )

describe('subscribe link', () => {
  test('POST …/subscribe-link returns a URL whose token joins the project, retiring the earlier one', async () => {
    const { v1, api } = setup()
    const first = await subscribeLink(v1)
    expect(first.project_id).toBe(projectId)
    expect(first.url).toBe(`${TEST_APP_ORIGIN}/subscribe/${first.token}`)

    const page = await apiRequest(api, { method: 'GET', path: `/api/subscribe/${first.token}` })
    expect(page.status).toBe(200)
    expect(await page.json()).toMatchObject({
      project: { id: projectId, org_slug: acme.slug },
      project_name: 'Bukit Jalil',
      windows: [{ id: windowId }],
      subscriber: null,
      privacy_notice_version: '2026-11-01'
    })
    expect((await join(api, first.token, 'ana@example.test')).status).toBe(202)

    const second = await subscribeLink(v1)
    expect((await join(api, first.token, 'ben@example.test')).status).toBe(410)
    expect((await join(api, second.token, 'ben@example.test')).status).toBe(202)
  })
})

describe('NTC-8: join and confirm', () => {
  test('a join yields only a confirmation notice until the subscriber confirms', async () => {
    const { v1, api, mailbox } = setup()
    const { token } = await subscribeLink(v1)
    const response = await join(api, token, 'Ana@Example.TEST', { language: 'ms' })
    expect(response.status).toBe(202)
    const body = (await response.json()) as { id: string; confirmed_at: string | null; email: string }
    expect(body).toMatchObject({ project_id: projectId, email: 'ana@example.test', confirmed_at: null, language: 'ms' })

    const [row] = await rows((tx) => tx.select().from(subscriber).where(eq(subscriber.id, body.id)))
    expect(row).toMatchObject({ confirmedAt: null, emailHash: emailHash('ana@example.test') })
    expect(await noticesOf(body.id)).toMatchObject([
      { kind: 'confirmation', channel: 'email', language: 'ms', status: 'sent', providerMessageId: 'mailbox-1' }
    ])
    expect(await consentsOf(body.id)).toMatchObject([
      {
        form: 'subscribe_link',
        noticeVersion: '2026-11-01',
        language: 'ms',
        ipHash: expect.stringMatching(/^[0-9a-f]{64}$/)
      }
    ])
    expect(mailbox.sent).toHaveLength(1)
    const [mail] = mailbox.sent
    expect(mail).toMatchObject({ to: 'ana@example.test', from: 'notices', category: 'confirmation' })
    expect(mail!.subject).toBe('Sahkan notis anda untuk Bukit Jalil')
    expect(mail!.text).toContain(`${TEST_APP_ORIGIN}/subscribe/`)
    expect(mail!.idempotencyKey).toBe((await noticesOf(body.id))[0]!.idempotencyKey)

    const confirmToken = tokenIn(mail!.text)
    const confirmed = await apiRequest(api, { method: 'POST', path: `/api/subscribe/${confirmToken}/confirm` })
    expect(confirmed.status).toBe(200)
    expect(((await confirmed.json()) as { confirmed_at: string | null }).confirmed_at).not.toBeNull()
    expect((await consentsOf(body.id)).map((c) => c.form)).toEqual(['subscribe_link', 'confirm'])

    // Single use.
    const again = await apiRequest(api, { method: 'POST', path: `/api/subscribe/${confirmToken}/confirm` })
    expect(again.status).toBe(410)
  })

  test('while PRIVACY_NOTICE_VERSION is null, join, import and preference writes answer 503 and write nothing', async () => {
    const { v1, api, mailbox } = setup()
    const { token } = await subscribeLink(v1)
    const known = await rows((tx) => makeSubscriber(tx, { projectId, role: 'Student', confirmedAt: new Date() }))
    const manage = await rows((tx) => issueSubscriberToken(tx, { subscriberId: known.id, purpose: 'manage' }))
    legal.version = null

    const joined = await join(api, token, 'ana@example.test')
    const imported = await apiRequest(v1, {
      as: admin,
      org: acme.slug,
      method: 'POST',
      path: `/v1/projects/${projectId}/subscribers`,
      idempotencyKey: randomUUID(),
      body: fields('ben@example.test')
    })
    const patched = await apiRequest(api, {
      method: 'PATCH',
      path: `/api/subscribe/${manage}`,
      body: { language: 'ms' }
    })
    for (const response of [joined, imported, patched]) {
      expect(response.status).toBe(503)
      expect(await response.json()).toMatchObject({ type: expect.stringMatching(/privacy-notice-unpublished$/) })
    }
    const all = await rows((tx) => tx.select().from(subscriber).where(eq(subscriber.projectId, projectId)))
    expect(all.map((row) => row.id)).toEqual([known.id])
    expect(await consentsOf(known.id)).toEqual([])
    expect(mailbox.sent).toEqual([])
  })

  test('an address suppressed by a bounce gets nothing and the same answer as a new one', async () => {
    const { v1, api, mailbox } = setup()
    const { token } = await subscribeLink(v1)
    await rows((tx) =>
      tx.insert(suppression).values({ orgId: acme.id, emailHash: emailHash('gone@example.test'), reason: 'bounce' })
    )
    const fresh = await join(api, token, 'new@example.test')
    const bounced = await join(api, token, 'gone@example.test')
    expect(bounced.status).toBe(fresh.status)
    const [a, b] = [(await fresh.json()) as Record<string, unknown>, (await bounced.json()) as Record<string, unknown>]
    expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort())
    expect(b).toMatchObject({ email: 'gone@example.test', confirmed_at: null })
    expect(mailbox.sent.map((m) => m.to)).toEqual(['new@example.test'])
  })

  test('a confirmed address that joins again keeps its settings and gets a fresh preference link', async () => {
    const { v1, api, mailbox } = setup()
    const { token } = await subscribeLink(v1)
    const known = await rows((tx) =>
      makeSubscriber(tx, { projectId, email: 'kim@example.test', role: 'Student', confirmedAt: new Date() })
    )
    const response = await join(api, token, 'kim@example.test')
    expect(response.status).toBe(202)
    expect(await response.json()).toMatchObject({ id: known.id, confirmed_at: null, role: 'Lecturer' })
    const [row] = await rows((tx) => tx.select().from(subscriber).where(eq(subscriber.id, known.id)))
    expect(row!.role).toBe('Student')
    expect(mailbox.sent).toMatchObject([{ to: 'kim@example.test', category: 'preference_link' }])

    const page = await apiRequest(api, { method: 'GET', path: `/api/subscribe/${tokenIn(mailbox.sent[0]!.text)}` })
    expect(await page.json()).toMatchObject({ subscriber: { id: known.id, role: 'Student' } })
  })

  test('two joins of one new address at once both answer 202 and make one subscriber', async () => {
    const { v1, api } = setup()
    const { token } = await subscribeLink(v1)
    const answers = await Promise.all([join(api, token, 'twin@example.test'), join(api, token, 'twin@example.test')])
    expect(answers.map((answer) => answer.status)).toEqual([202, 202])
    const ids = await Promise.all(answers.map(async (answer) => ((await answer.json()) as { id: string }).id))
    expect(ids[1]).toBe(ids[0])
    const all = await rows((tx) => tx.select().from(subscriber).where(eq(subscriber.email, 'twin@example.test')))
    expect(all).toHaveLength(1)
  })

  test('an unconfirmed address that joins again keeps its first choices, and gets one confirmation per 10 minutes', async () => {
    const { v1, api, mailbox } = setup()
    const { token } = await subscribeLink(v1)
    const known = await rows((tx) =>
      makeSubscriber(tx, { projectId, email: 'pat@example.test', role: 'Student', windowIds: [] })
    )
    const first = await join(api, token, 'pat@example.test')
    const second = await join(api, token, 'pat@example.test')
    expect([first.status, second.status]).toEqual([202, 202])
    expect(await second.json()).toMatchObject({ id: known.id, role: 'Lecturer', window_ids: [windowId] })

    const [row] = await rows((tx) => tx.select().from(subscriber).where(eq(subscriber.id, known.id)))
    expect(row).toMatchObject({ role: 'Student', windowIds: [], confirmedAt: null })
    expect((await consentsOf(known.id)).map((c) => c.form)).toEqual(['subscribe_link', 'subscribe_link'])
    expect(mailbox.sent).toMatchObject([{ to: 'pat@example.test', category: 'confirmation' }])
    expect((await noticesOf(known.id)).map((n) => n.kind)).toEqual(['confirmation'])
  })

  test('a join may pick only the project’s visible, uncancelled, non-guest windows', async () => {
    const { v1, api, mailbox } = setup()
    const { token } = await subscribeLink(v1)
    const later = { startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 90_000_000) }
    const refused = await rows(async (tx) => [
      await makeWindow(tx, { ...later, projectId, guest: true, via: 'guest' }),
      await makeWindow(tx, { ...later, projectId, cancelledAt: new Date() }),
      await makeWindow(tx, { ...later, projectId, moderation: 'hidden_pending_review' }),
      await makeWindow(tx, later)
    ])
    for (const window of refused) {
      const response = await join(api, token, 'win@example.test', { window_ids: [windowId, window.id] })
      expect(response.status, window.id).toBe(422)
      expect(await response.json()).toMatchObject({ errors: [{ pointer: '/window_ids/1' }] })
    }
    const page = (await (await apiRequest(api, { method: 'GET', path: `/api/subscribe/${token}` })).json()) as {
      windows: Array<{ id: string }>
    }
    expect(page.windows.map((w) => w.id)).toEqual([windowId])
    expect(mailbox.sent).toEqual([])
  })

  test('a join whose email fails at Resend still answers the same, and the notice records the failure', async () => {
    const errors: string[] = []
    vi.spyOn(console, 'error').mockImplementation((line: unknown) => void errors.push(String(line)))
    const failing: EmailTransport = {
      send: async () => {
        throw new Error('Resend send failed: validation_error (HTTP 422)')
      }
    }
    const { v1, api } = setup({ email: failing })
    const { token } = await subscribeLink(v1)
    const response = await join(api, token, 'unverified@example.test')
    expect(response.status).toBe(202)
    const { id } = (await response.json()) as { id: string }
    expect(await noticesOf(id)).toMatchObject([{ kind: 'confirmation', status: 'failed', providerMessageId: null }])
    expect(errors.join('\n')).toMatch(/subscriber email failed/)
    expect(errors.join('\n')).not.toContain(token)
    expect(errors.join('\n')).not.toContain('unverified@example.test')
  })
})

describe('NTC-9: unsubscribe', () => {
  test('one POST with the RFC 8058 body writes the suppression at once, with no cookie or Origin', async () => {
    const { api } = setup()
    const sub = await rows((tx) =>
      makeSubscriber(tx, { projectId, email: 'lee@example.test', role: 'Student', confirmedAt: new Date() })
    )
    // As #158 mints it for a notice's List-Unsubscribe header.
    const token = await rows((tx) => issueSubscriberToken(tx, { subscriberId: sub.id, purpose: 'unsubscribe' }))
    const post = () =>
      api.fetch(
        new Request(`https://app.skyclause.m1ku.tech/api/subscribe/${token}/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'List-Unsubscribe=One-Click'
        })
      )
    expect((await post()).status).toBe(204)
    expect((await post()).status).toBe(204)

    const [row] = await rows((tx) => tx.select().from(subscriber).where(eq(subscriber.id, sub.id)))
    expect(row!.unsubscribedAt).not.toBeNull()
    expect(await suppressionsOf('lee@example.test')).toMatchObject([{ reason: 'unsubscribe' }])
    const tracked = await withSystem('test', (tx) =>
      tx
        .select({ props: analyticsEvent.props })
        .from(analyticsEvent)
        .where(and(eq(analyticsEvent.name, 'unsubscribed'), eq(analyticsEvent.projectId, projectId)))
    )
    expect(tracked).toEqual([{ props: { channel: 'email' } }])
  })

  test('confirming again lifts the unsubscribe suppression', async () => {
    const { v1, api, mailbox } = setup()
    const sub = await rows((tx) =>
      makeSubscriber(tx, { projectId, email: 'mia@example.test', role: 'Student', confirmedAt: new Date() })
    )
    const token = await rows((tx) => issueSubscriberToken(tx, { subscriberId: sub.id, purpose: 'unsubscribe' }))
    await apiRequest(api, { method: 'POST', path: `/api/subscribe/${token}/unsubscribe` })
    const link = await subscribeLink(v1)
    expect((await join(api, link.token, 'mia@example.test')).status).toBe(202)
    expect(mailbox.sent).toMatchObject([{ category: 'confirmation' }])
    await apiRequest(api, { method: 'POST', path: `/api/subscribe/${tokenIn(mailbox.sent[0]!.text)}/confirm` })
    const [row] = await rows((tx) => tx.select().from(subscriber).where(eq(subscriber.id, sub.id)))
    expect(row).toMatchObject({ unsubscribedAt: null, confirmedAt: expect.any(Date) })
    expect(await suppressionsOf('mia@example.test')).toEqual([])
  })
})

describe('preferences (NTC-14)', () => {
  test('PATCH changes windows and language and logs the change as a consent record', async () => {
    const { api } = setup()
    const sub = await rows((tx) =>
      makeSubscriber(tx, { projectId, role: 'Student', confirmedAt: new Date(), windowIds: [] })
    )
    const manage = await rows((tx) => issueSubscriberToken(tx, { subscriberId: sub.id, purpose: 'manage' }))
    const response = await apiRequest(api, {
      method: 'PATCH',
      path: `/api/subscribe/${manage}`,
      body: { window_ids: [windowId], language: 'ms', role: 'Student' }
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ window_ids: [windowId], language: 'ms', role: 'Student' })
    expect(await consentsOf(sub.id)).toMatchObject([
      { form: 'preferences', changed: ['window_ids', 'language'], language: 'ms', noticeVersion: '2026-11-01' }
    ])
  })

  test('PATCH accepts nothing beyond email, role, windows, channels and language', async () => {
    const { api } = setup()
    const sub = await rows((tx) => makeSubscriber(tx, { projectId, role: 'Student', confirmedAt: new Date() }))
    const manage = await rows((tx) => issueSubscriberToken(tx, { subscriberId: sub.id, purpose: 'manage' }))
    const extra = await apiRequest(api, {
      method: 'PATCH',
      path: `/api/subscribe/${manage}`,
      body: { language: 'ms', confirmed_at: null }
    })
    expect(extra.status).toBe(422)
    const elsewhere = await inOrg(acme.id, (tx) => makeWindow(tx))
    const foreign = await apiRequest(api, {
      method: 'PATCH',
      path: `/api/subscribe/${manage}`,
      body: { window_ids: [elsewhere.id] }
    })
    expect(foreign.status).toBe(422)
    expect(await consentsOf(sub.id)).toEqual([])
  })

  test('PATCH keeps the address: any new one is refused alike (#110 corrects it), the same one passes', async () => {
    const { api, mailbox } = setup()
    const sub = await rows((tx) =>
      makeSubscriber(tx, { projectId, email: 'old@example.test', role: 'Student', confirmedAt: new Date() })
    )
    await rows((tx) => makeSubscriber(tx, { projectId, email: 'taken@example.test', role: 'Student' }))
    const manage = await rows((tx) => issueSubscriberToken(tx, { subscriberId: sub.id, purpose: 'manage' }))
    const patch = (body: Record<string, unknown>) =>
      apiRequest(api, { method: 'PATCH', path: `/api/subscribe/${manage}`, body })

    const free = await patch({ email: 'free@example.test', language: 'ms' })
    const taken = await patch({ email: 'taken@example.test', language: 'ms' })
    expect([free.status, taken.status]).toEqual([422, 422])
    const [a, b] = [(await free.json()) as Record<string, unknown>, (await taken.json()) as Record<string, unknown>]
    expect(b).toEqual(a)
    expect(a).toMatchObject({ errors: [{ pointer: '/email' }] })
    expect(await consentsOf(sub.id)).toEqual([])

    const same = await patch({ email: 'Old@Example.TEST', language: 'ms' })
    expect(same.status).toBe(200)
    expect(await same.json()).toMatchObject({
      email: 'old@example.test',
      language: 'ms',
      confirmed_at: expect.any(String)
    })
    expect((await consentsOf(sub.id)).map((c) => c.changed)).toEqual([['language']])
    expect(mailbox.sent).toEqual([])
  })

  test('PATCH answers 503 while the privacy notice is unpublished', async () => {
    const { api } = setup()
    const sub = await rows((tx) => makeSubscriber(tx, { projectId, role: 'Student', confirmedAt: new Date() }))
    const manage = await rows((tx) => issueSubscriberToken(tx, { subscriberId: sub.id, purpose: 'manage' }))
    legal.version = null
    const response = await apiRequest(api, { method: 'PATCH', path: `/api/subscribe/${manage}`, body: {} })
    expect(response.status).toBe(503)
  })
})

describe('tokens', () => {
  test('expired, used, wrong-purpose and unknown tokens fail alike, and none reaches a log', async () => {
    const lines: string[] = []
    vi.spyOn(console, 'error').mockImplementation((line: unknown) => void lines.push(String(line)))
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => void lines.push(String(line)))
    const { api } = setup()
    const sub = await rows((tx) => makeSubscriber(tx, { projectId, role: 'Student', confirmedAt: new Date() }))
    const issue = (purpose: 'confirm' | 'manage' | 'unsubscribe') =>
      rows((tx) => issueSubscriberToken(tx, { subscriberId: sub.id, purpose }))

    const expired = await issue('manage')
    await rows((tx) =>
      tx
        .update(subscriberToken)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(subscriberToken.purpose, 'manage'))
    )
    const used = await issue('confirm')
    await apiRequest(api, { method: 'POST', path: `/api/subscribe/${used}/confirm` })
    const wrong = await issue('unsubscribe')
    const unknown = randomUUID().replaceAll('-', '').padEnd(43, 'x')

    const answers = await Promise.all([
      apiRequest(api, { method: 'PATCH', path: `/api/subscribe/${expired}`, body: { language: 'ms' } }),
      apiRequest(api, { method: 'GET', path: `/api/subscribe/${expired}` }),
      apiRequest(api, { method: 'POST', path: `/api/subscribe/${used}/confirm` }),
      apiRequest(api, { method: 'POST', path: `/api/subscribe/${wrong}/confirm` }),
      apiRequest(api, { method: 'PATCH', path: `/api/subscribe/${wrong}`, body: { language: 'ms' } }),
      apiRequest(api, { method: 'POST', path: `/api/subscribe/${unknown}/unsubscribe` }),
      join(api, wrong, 'ana@example.test')
    ])
    for (const answer of answers) {
      expect(answer.status).toBe(410)
      const body = (await answer.json()) as Record<string, unknown>
      expect(Problem.safeParse(body).success).toBe(true)
      expect(body).toMatchObject({ title: 'Link expired', detail: 'This link has expired or was already used.' })
    }
    legal.version = null
    await join(api, wrong, 'ana@example.test')
    for (const token of [expired, used, wrong, unknown]) expect(lines.join('\n')).not.toContain(token)
  })
})

describe('NTC-13: Admin list and import', () => {
  const imp = (app: ReturnType<typeof setup>['v1'], email: string, as: Principal = admin) =>
    apiRequest(app, {
      as,
      org: acme.slug,
      method: 'POST',
      path: `/v1/projects/${projectId}/subscribers`,
      idempotencyKey: randomUUID(),
      body: fields(email)
    })

  test('an imported address gets only a confirmation, an `import` consent record naming who, and no notice', async () => {
    const { v1, mailbox } = setup()
    const response = await imp(v1, 'Imported@Example.test')
    expect(response.status).toBe(201)
    const view = (await response.json()) as { id: string }
    expect(view).toMatchObject({
      email: 'imported@example.test',
      status: 'unconfirmed',
      suppressed: false,
      last_notice_at: null,
      consent: { form: 'import', notice_version: '2026-11-01', language: 'en' }
    })
    expect(await consentsOf(view.id)).toMatchObject([
      { form: 'import', actorId: (admin as { accountId: string }).accountId, ipHash: null }
    ])
    expect((await noticesOf(view.id)).map((n) => n.kind)).toEqual(['confirmation'])
    expect(mailbox.sent).toMatchObject([{ to: 'imported@example.test', category: 'confirmation' }])
  })

  test('an import skips any suppressed hash, and re-importing an address changes nothing', async () => {
    const { v1, mailbox } = setup()
    await rows((tx) =>
      tx.insert(suppression).values({ orgId: acme.id, emailHash: emailHash('out@example.test'), reason: 'unsubscribe' })
    )
    const response = await imp(v1, 'out@example.test')
    expect(await response.json()).toMatchObject({ status: 'suppressed', suppressed: true, consent: { form: 'import' } })
    expect(mailbox.sent).toEqual([])

    const first = (await (await imp(v1, 'twice@example.test')).json()) as { id: string }
    const second = (await (await imp(v1, 'twice@example.test')).json()) as { id: string }
    expect(second.id).toBe(first.id)
    expect(await consentsOf(first.id)).toHaveLength(1)
    expect(mailbox.sent).toHaveLength(1)
  })

  test('every listed subscriber shows status and a consent record, filtered by window, channel and status', async () => {
    const { v1, api, mailbox } = setup()
    await imp(v1, 'a@example.test')
    await imp(v1, 'b@example.test')
    await apiRequest(api, { method: 'POST', path: `/api/subscribe/${tokenIn(mailbox.sent[0]!.text)}/confirm` })
    const list = (query: Record<string, string> = {}) =>
      apiRequest(v1, { as: admin, org: acme.slug, method: 'GET', path: `/v1/projects/${projectId}/subscribers`, query })

    const all = (await (await list({ limit: '1' })).json()) as { data: unknown[]; next_cursor: string | null }
    expect(all.data).toHaveLength(1)
    const rest = (await (await list({ limit: '1', cursor: all.next_cursor! })).json()) as typeof all
    expect(rest).toMatchObject({ data: [{}], next_cursor: null })
    for (const row of [...all.data, ...rest.data]) expect(row).toMatchObject({ consent: { form: expect.any(String) } })

    expect(await (await list({ status: 'confirmed' })).json()).toMatchObject({
      data: [{ email: 'a@example.test', status: 'confirmed', consent: { form: 'confirm' } }]
    })
    expect(((await (await list({ window_id: windowId, channel: 'email' })).json()) as typeof all).data).toHaveLength(2)
    expect(((await (await list({ channel: 'ics' })).json()) as typeof all).data).toHaveLength(0)
  })

  test('DELETE removes a subscriber through eraseSubscriber', async () => {
    const { v1 } = setup()
    const sub = await rows((tx) => makeSubscriber(tx, { projectId }))
    const response = await apiRequest(v1, {
      as: admin,
      org: acme.slug,
      method: 'DELETE',
      path: `/v1/subscribers/${sub.id}`
    })
    expect(response.status).toBe(204)
    expect(erased).toContain(sub.id)
  })
})

describe('subscriber counts', () => {
  test('answer an Approver with counts by status, window and channel', async () => {
    const { v1 } = setup()
    await rows(async (tx) => {
      await makeSubscriber(tx, { projectId, windowIds: [windowId], confirmedAt: new Date() })
      await makeSubscriber(tx, { projectId, windowIds: [windowId] })
      await makeSubscriber(tx, { projectId, confirmedAt: new Date(), unsubscribedAt: new Date() })
    })
    const response = await apiRequest(v1, {
      as: asSession({ org: acme.slug, role: 'approver' }),
      org: acme.slug,
      method: 'GET',
      path: `/v1/projects/${projectId}/subscriber-counts`
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      total: 3,
      confirmed: 1,
      unconfirmed: 1,
      suppressed: 0,
      bounced: 0,
      complained: 0,
      unsubscribed: 1,
      by_window: [{ window_id: windowId, count: 1 }],
      by_channel: [{ channel: 'email', count: 1 }]
    })
  })

  test('refuse a principal without project.view', async () => {
    const { v1 } = setup()
    const response = await apiRequest(v1, {
      as: asDevice({ org: acme.slug }),
      method: 'GET',
      path: `/v1/projects/${projectId}/subscriber-counts`
    })
    expect(response.status).toBe(403)
  })
})

describe('§7: every /v1 route', () => {
  const editor = asSession({ org: acme.slug, role: 'editor' })
  const outsider = asSession({ org: other.slug, role: 'owner' })
  const routes = () => [
    { operationId: 'listSubscribers', method: 'GET', path: `/v1/projects/${projectId}/subscribers` },
    {
      operationId: 'createSubscriber',
      method: 'POST',
      path: `/v1/projects/${projectId}/subscribers`,
      body: fields('x@example.test')
    },
    { operationId: 'createSubscribeLink', method: 'POST', path: `/v1/projects/${projectId}/subscribe-link` },
    { operationId: 'deleteSubscriber', method: 'DELETE', path: `/v1/subscribers/{subscriber}` }
  ]

  test('answers 404 for another organisation’s rows', async () => {
    const { v1 } = setup()
    const sub = await rows((tx) => makeSubscriber(tx, { projectId }))
    const cases = [
      crossOrgCase('listSubscribers', { app: v1, as: outsider, org: other.slug, params: { id: projectId } }),
      crossOrgCase('createSubscriber', {
        app: v1,
        as: outsider,
        org: other.slug,
        params: { id: projectId },
        body: fields('x@example.test')
      }),
      crossOrgCase('createSubscribeLink', { app: v1, as: outsider, org: other.slug, params: { id: projectId } }),
      crossOrgCase('deleteSubscriber', { app: v1, as: outsider, org: other.slug, params: { id: sub.id } }),
      crossOrgCase('getSubscriberCounts', { app: v1, as: outsider, org: other.slug, params: { id: projectId } })
    ]
    for (const { run } of cases) await run()
    expect(erased).not.toContain(sub.id)
  })

  test('denies an Editor, below channels.manage', async () => {
    const { v1 } = setup()
    const sub = await rows((tx) => makeSubscriber(tx, { projectId }))
    for (const route of routes()) {
      const response = await apiRequest(v1, {
        as: editor,
        org: acme.slug,
        method: route.method,
        path: route.path.replace('{subscriber}', sub.id),
        body: route.body,
        idempotencyKey: route.method === 'POST' ? randomUUID() : undefined
      })
      expect(response.status, route.operationId).toBe(403)
    }
  })
})
