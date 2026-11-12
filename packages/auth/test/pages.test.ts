// Page helpers for server components: the principal, with a session's organisation role taken from the URL.
import { beforeAll, expect, test } from 'vitest'
import { pageAccountEmail, pagePrincipal } from '../src/pages'
import { addMember, makeAccount, makeOrg, makeShareLinkFor, signIn } from './harness'

let org: { id: string; slug: string }
let other: { id: string; slug: string }
let cookie: string
let accountId: string
let accountEmail: string
beforeAll(async () => {
  org = await makeOrg()
  other = await makeOrg()
  const account = await makeAccount()
  accountId = account.id
  accountEmail = account.email
  await addMember(org.id, accountId, 'approver')
  cookie = (await signIn(accountId)).cookie
})

const headers = (value: string) => new Headers({ Cookie: value, Host: 'app.skyclause.m1ku.tech' })

test('a member’s session takes the URL organisation’s ID and role, by slug or ID', async () => {
  for (const ref of [org.slug, org.id]) {
    const { principal, org: found } = await pagePrincipal(headers(cookie), { org: ref })
    expect(found).toMatchObject(org)
    expect(found).toMatchObject({ plan: 'community' })
    expect(principal).toMatchObject({ kind: 'session', accountId, orgId: org.id, role: 'approver' })
  }
})

test('a malformed forwarded host or scheme never breaks reading the principal', async () => {
  for (const forwarded of [
    { 'X-Forwarded-Host': 'user@evil.com' },
    { 'X-Forwarded-Host': 'bad:port' },
    { 'X-Forwarded-Host': '' },
    { 'X-Forwarded-Proto': 'bad:port' },
    { 'X-Forwarded-Proto': '' }
  ]) {
    const malformed = new Headers({ Cookie: cookie, Host: 'app.skyclause.m1ku.tech', ...forwarded })
    const { principal } = await pagePrincipal(malformed, { org: org.slug })
    expect(principal, JSON.stringify(forwarded)).toMatchObject({ kind: 'session', accountId, orgId: org.id })
  }
})

test('server-rendered account settings can read the signed-in email without adding it to Principal', async () => {
  expect(await pageAccountEmail(headers(cookie))).toBe(accountEmail)
  expect(await pageAccountEmail(new Headers())).toBeNull()
})

test('a non-member keeps no organisation; an unknown organisation is null; no org leaves the session as is', async () => {
  expect(await pagePrincipal(headers(cookie), { org: other.slug })).toMatchObject({
    org: other,
    principal: { kind: 'session', orgId: null, role: null }
  })
  expect(await pagePrincipal(headers(cookie), { org: 'no-such-organisation' })).toMatchObject({
    org: null,
    principal: { kind: 'session', orgId: null, role: null }
  })
  expect(await pagePrincipal(headers(cookie))).toMatchObject({ org: null, principal: { orgId: null } })
})

test('a share link keeps its own organisation, and no credential is null', async () => {
  const link = await makeShareLinkFor({ orgId: org.id, access: 'view' })
  expect(await pagePrincipal(headers(`sc_share=${link.token}`), { org: org.slug })).toMatchObject({
    principal: { kind: 'share_link', orgId: org.id }
  })
  expect((await pagePrincipal(new Headers(), { org: org.slug })).principal).toBeNull()
})
