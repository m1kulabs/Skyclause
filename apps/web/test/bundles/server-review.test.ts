// #372: the bundle page's server read, through #150's services on this file's test database. Rows come from #92's
// factories and the account from #94's harness; `getOrgPrincipal` stands in for the request's cookies.
import '@skyclause/auth/test/harness/database'
import { addMember, inOrg, makeAccount, makeOrg } from '@skyclause/auth/testing'
import type { Principal, Role } from '@skyclause/contracts'
import { makeBundle, makeCall, makeWindow } from '@skyclause/db/test/factories/index'
import { beforeAll, expect, test, vi } from 'vitest'
import { getOrgPrincipal } from '../../lib/principal'
import { serverReview } from '../../features/bundles/server-review'

vi.mock('../../lib/principal', () => ({ getOrgPrincipal: vi.fn() }))

let org: { id: string; slug: string }
let bundleId: string
let callId: string
let projectId: string

beforeAll(async () => {
  org = await makeOrg()
  const rows = await inOrg(org.id, async (tx) => {
    const bundle = await makeBundle(tx, { state: 'needs_review' })
    const window = await makeWindow(tx, {
      projectId: bundle.projectId,
      title: 'Test release wave',
      kind: 'commute_wave',
      startsAt: new Date('2099-11-02T07:30:00Z'),
      endsAt: new Date('2099-11-02T07:45:00Z')
    })
    const call = await makeCall(tx, {
      bundleId: bundle.id,
      windowId: window.id,
      mode: 'commute_disruption',
      shadow: { clauses: [] },
      expiresAt: new Date('2099-11-02T07:45:00Z')
    })
    return { bundleId: bundle.id, callId: call.id, projectId: bundle.projectId }
  })
  ;({ bundleId, callId, projectId } = rows)
})

async function signedIn(role: Role | null): Promise<Principal> {
  const account = await makeAccount()
  if (role) await addMember(org.id, account.id, role)
  return {
    kind: 'session',
    client: 'app',
    clientName: null,
    via: 'cookie',
    accountId: account.id,
    sessionId: `test-session-${account.id}`,
    authenticatedAt: new Date(),
    // #94's page helper fills a member's session with the URL organisation; a non-member's keeps none.
    orgId: role ? org.id : null,
    role,
    isGuest: false,
    staff: false
  }
}

test('an approver’s page arrives with the bundle and each call read on the server', async () => {
  vi.mocked(getOrgPrincipal).mockResolvedValue({ principal: await signedIn('approver'), orgId: org.id })
  const review = await serverReview(org.slug, bundleId)
  expect(review?.data.bundle.id).toBe(bundleId)
  expect(review?.data.calls.map((call) => [call.id, call.call_id, call.window?.title])).toEqual([
    [callId, callId, 'Test release wave']
  ])
  expect(review?.data).toMatchObject({ canApprove: true, shortcuts: true, errors: [] })
  expect(review?.now).toBeTypeOf('number')
})

test('a viewer’s page arrives read on the server, without approval', async () => {
  vi.mocked(getOrgPrincipal).mockResolvedValue({ principal: await signedIn('viewer'), orgId: org.id })
  expect((await serverReview(org.slug, bundleId))?.data.canApprove).toBe(false)
})

test('a session outside the organisation, or no session, gets no server read', async () => {
  vi.mocked(getOrgPrincipal).mockResolvedValue({ principal: await signedIn(null), orgId: org.id })
  expect(await serverReview(org.slug, bundleId)).toBeUndefined()
  vi.mocked(getOrgPrincipal).mockResolvedValue({ principal: null, orgId: org.id })
  expect(await serverReview(org.slug, bundleId)).toBeUndefined()
})

test('a share link, even to this bundle’s project, leaves the page to the client’s read', async () => {
  const principal: Principal = {
    kind: 'share_link',
    client: 'app',
    clientName: null,
    linkId: 'test-link',
    orgId: org.id,
    projectId,
    access: 'reviewer'
  }
  vi.mocked(getOrgPrincipal).mockResolvedValue({ principal, orgId: org.id })
  expect(await serverReview(org.slug, bundleId)).toBeUndefined()
})

test('a bundle the organisation doesn’t hold leaves the page to the client’s read', async () => {
  const other = await makeOrg()
  const elsewhere = await inOrg(other.id, (tx) => makeBundle(tx))
  vi.mocked(getOrgPrincipal).mockResolvedValue({ principal: await signedIn('approver'), orgId: org.id })
  expect(await serverReview(org.slug, elsewhere.id)).toBeUndefined()
})
