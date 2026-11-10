import { account, passkey, user } from '@skyclause/db'
import { authDatabase } from '@skyclause/db/auth'
import { makeUser } from '@skyclause/db/test/factories/index'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { apiRequest, asApiKey, asGuestToken, asOAuth, asSession, createTestApi, TEST_NOW } from './harness'

const ids: string[] = []
const api = () => createTestApi().api

async function makePrincipal(o: { guest?: boolean; authenticatedAt?: Date } = {}) {
  const record = await makeUser()
  ids.push(record.id)
  return {
    accountId: record.id,
    principal: {
      ...asSession({ org: 'account-settings', role: 'owner', ...o }),
      accountId: record.id
    }
  }
}

async function addPasskey(accountId: string) {
  await authDatabase()
    .insert(passkey)
    .values({
      userId: accountId,
      name: 'Laptop',
      publicKey: 'test-public-key',
      credentialID: `credential-${accountId}`,
      counter: 0,
      deviceType: 'platform',
      backedUp: false
    })
}

async function addGoogle(accountId: string) {
  await authDatabase()
    .insert(account)
    .values({
      userId: accountId,
      accountId: `google-${accountId}`,
      providerId: 'google'
    })
}

afterEach(async () => {
  const created = ids.splice(0)
  if (created.length) await authDatabase().delete(user).where(eq(user.id, created[0]!))
  for (const id of created.slice(1)) await authDatabase().delete(user).where(eq(user.id, id))
})

async function problemCode(response: Response) {
  const body = (await response.json()) as { type: string }
  return body.type.split('/').at(-1)
}

describe('/api/me/preferences', () => {
  it('preserves omitted preferences when another appearance setting changes', async () => {
    const { principal } = await makePrincipal()
    const app = api()
    const saved = await apiRequest(app, {
      as: principal,
      method: 'PATCH',
      path: '/api/me/preferences',
      body: { shortcuts: false, sidebar_collapsed: true }
    })
    expect(saved.status).toBe(200)

    const changed = await apiRequest(app, {
      as: principal,
      method: 'PATCH',
      path: '/api/me/preferences',
      body: { theme: 'light' }
    })
    expect(changed.status).toBe(200)
    expect(await changed.json()).toMatchObject({ theme: 'light', shortcuts: false, sidebar_collapsed: true })
    const reloaded = await apiRequest(app, { as: principal, method: 'GET', path: '/api/me/preferences' })
    expect(await reloaded.json()).toMatchObject({ theme: 'light', shortcuts: false, sidebar_collapsed: true })
  })

  it('returns the account defaults and persists a partial update for a guest session', async () => {
    const { principal } = await makePrincipal({ guest: true })
    const app = api()
    const loaded = await apiRequest(app, { as: principal, method: 'GET', path: '/api/me/preferences' })

    expect(loaded.status).toBe(200)
    expect(await loaded.json()).toEqual({
      theme: 'dark',
      high_contrast: false,
      density: 'comfortable',
      reduced_motion: false,
      language: 'en',
      shortcuts: true,
      sidebar_collapsed: false
    })

    const changed = await apiRequest(app, {
      as: principal,
      method: 'PATCH',
      path: '/api/me/preferences',
      body: { theme: 'light', shortcuts: false, sidebar_collapsed: true }
    })
    expect(changed.status).toBe(200)
    expect(await changed.json()).toMatchObject({ theme: 'light', shortcuts: false, sidebar_collapsed: true })

    const reloaded = await apiRequest(app, { as: principal, method: 'GET', path: '/api/me/preferences' })
    expect(await reloaded.json()).toMatchObject({ theme: 'light', shortcuts: false, sidebar_collapsed: true })
  })
})

describe('/api/me/security', () => {
  it('refuses to disable magic link when it is the only sign-in method', async () => {
    const { principal } = await makePrincipal()
    const response = await apiRequest(api(), {
      as: principal,
      method: 'PATCH',
      path: '/api/me/security',
      body: { magic_link_enabled: false }
    })

    expect(response.status).toBe(409)
    expect(await problemCode(response)).toBe('last-sign-in-method')
  })

  it('allows magic link to turn off when a passkey or Google remains', async () => {
    const passkeyAccount = await makePrincipal()
    await addPasskey(passkeyAccount.accountId)
    const googleAccount = await makePrincipal()
    await addGoogle(googleAccount.accountId)

    for (const { principal } of [passkeyAccount, googleAccount]) {
      const response = await apiRequest(api(), {
        as: principal,
        method: 'PATCH',
        path: '/api/me/security',
        body: { magic_link_enabled: false }
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ magic_link_enabled: false })
    }
  })

  it('requires recent authentication before turning magic link off', async () => {
    const { principal } = await makePrincipal({
      authenticatedAt: new Date(TEST_NOW.getTime() - 13 * 60 * 60 * 1000)
    })
    await addGoogle(principal.accountId)
    const response = await apiRequest(api(), {
      as: principal,
      method: 'PATCH',
      path: '/api/me/security',
      body: { magic_link_enabled: false }
    })

    expect(response.status).toBe(401)
    expect(await problemCode(response)).toBe('reauth-required')
  })

  it('refuses guests, API keys, OAuth and guest tokens', async () => {
    const { principal } = await makePrincipal({ guest: true })
    const app = api()
    const guest = await apiRequest(app, {
      as: principal,
      method: 'PATCH',
      path: '/api/me/security',
      body: { magic_link_enabled: false }
    })
    expect(guest.status).toBe(403)

    for (const token of [
      asApiKey({ org: 'account-settings', role: 'owner', scopes: ['read', 'draft', 'admin'] }),
      asOAuth({ org: 'account-settings', role: 'owner', resource: 'api' }),
      asGuestToken({ org: 'account-settings' })
    ]) {
      expect((await apiRequest(app, { as: token, method: 'GET', path: '/api/me/preferences' })).status).toBe(403)
      expect(
        (
          await apiRequest(app, {
            as: token,
            method: 'PATCH',
            path: '/api/me/security',
            body: { magic_link_enabled: false }
          })
        ).status
      ).toBe(403)
    }
  })
})
