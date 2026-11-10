import { account, passkey, session, user } from '@skyclause/db'
import { authDatabase, countSignInMethods } from '@skyclause/db/auth'
import { eq } from 'drizzle-orm'
import { passkey as passkeyPlugin } from '@better-auth/passkey'
import { createAuthMiddleware } from 'better-auth/api'
import { afterEach, expect, test } from 'vitest'
import { authSettings, createAuth } from '../src/instance'
import { addTestPasskey, makeAccount, signIn, TEST_AUTH_ENV } from './harness'

const createdUserIds: string[] = []
const APP = TEST_AUTH_ENV.APP_ORIGIN
const auth = createAuth(authSettings(), { plugins: [passkeyPlugin()] })

async function addAccount(o: { magicLinkEnabled?: boolean; google?: boolean; passkey?: boolean } = {}) {
  const accountRecord = await makeAccount()
  createdUserIds.push(accountRecord.id)
  if (o.magicLinkEnabled === false) {
    await authDatabase().update(user).set({ magicLinkEnabled: false }).where(eqUser(accountRecord.id))
  }
  const [google] = o.google
    ? await authDatabase()
        .insert(account)
        .values({
          userId: accountRecord.id,
          accountId: `google-${accountRecord.id}`,
          providerId: 'google'
        })
        .returning({ id: account.id })
    : []
  const [credential] = o.passkey
    ? await authDatabase()
        .insert(passkey)
        .values({
          userId: accountRecord.id,
          name: 'Laptop',
          publicKey: 'test-public-key',
          credentialID: `credential-${accountRecord.id}`,
          counter: 0,
          deviceType: 'platform',
          backedUp: false
        })
        .returning({ id: passkey.id })
    : []
  return {
    accountId: accountRecord.id,
    googleId: google?.id,
    passkeyId: credential?.id,
    login: await signIn(accountRecord.id)
  }
}

const eqUser = (id: string) => eq(user.id, id)

afterEach(async () => {
  const ids = createdUserIds.splice(0)
  for (const id of ids) await authDatabase().delete(user).where(eqUser(id))
})

async function bodyCode(response: Response) {
  return (await response.json()) as { code?: string }
}

function post(path: string, body: unknown, cookie: string) {
  return auth.handler(
    new Request(`${APP}/api/auth${path}`, {
      method: 'POST',
      headers: { Cookie: cookie, Origin: APP, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  )
}

test('removing the only passkey while magic link is off returns last-sign-in-method', async () => {
  const current = await addAccount({ magicLinkEnabled: false, passkey: true })
  const response = await post('/passkey/delete-passkey', { id: current.passkeyId }, current.login.cookie)

  expect(response.status).toBe(409)
  expect(await bodyCode(response)).toMatchObject({ code: 'last-sign-in-method' })
})

test('concurrent passkey removals cannot remove every sign-in method', async () => {
  const current = await addAccount({ magicLinkEnabled: false, passkey: true })
  const second = await addTestPasskey(current.accountId)
  let release!: () => void
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  let checked = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const concurrent = createAuth(authSettings(), {
    plugins: [
      passkeyPlugin(),
      {
        id: 'test-concurrent-removal',
        hooks: {
          before: [
            {
              matcher: (context) => context.path === '/passkey/delete-passkey',
              handler: createAuthMiddleware(async () => {
                // Pause after the last-method guard, giving another request time to pass it before either deletes.
                timer ??= setTimeout(release, 1_000)
                if (++checked === 2) release()
                await released
              })
            }
          ]
        }
      }
    ]
  })
  let responses: Response[]
  try {
    responses = await Promise.all(
      [current.passkeyId, second.id].map((id) =>
        concurrent.handler(
          new Request(`${APP}/api/auth/passkey/delete-passkey`, {
            method: 'POST',
            headers: { Cookie: current.login.cookie, Origin: APP, 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
          })
        )
      )
    )
  } finally {
    clearTimeout(timer)
  }

  expect(responses.map((response) => response.status).sort()).toEqual([200, 409])
  expect(await countSignInMethods(current.accountId)).toMatchObject({ passkeys: 1, magicLinkEnabled: false })
})

test('unlinking the only Google account while magic link is off returns last-sign-in-method', async () => {
  const current = await addAccount({ magicLinkEnabled: false, google: true })
  const response = await post('/unlink-account', { accountId: current.googleId }, current.login.cookie)

  expect(response.status).toBe(409)
  expect(await bodyCode(response)).toMatchObject({ code: 'last-sign-in-method' })
})

test('unlinking Google requires recent authentication; passkey removal does not', async () => {
  const googleAccount = await addAccount({ google: true })
  const old = new Date(Date.now() - 13 * 60 * 60 * 1000)
  await authDatabase().update(session).set({ createdAt: old }).where(eq(session.id, googleAccount.login.sessionId))
  const unlink = await post('/unlink-account', { accountId: googleAccount.googleId }, googleAccount.login.cookie)
  expect(unlink.status).toBe(401)
  expect(await bodyCode(unlink)).toMatchObject({ code: 'reauth-required' })

  const passkeyAccount = await addAccount({ passkey: true })
  await authDatabase().update(session).set({ createdAt: old }).where(eq(session.id, passkeyAccount.login.sessionId))
  const remove = await post('/passkey/delete-passkey', { id: passkeyAccount.passkeyId }, passkeyAccount.login.cookie)
  expect(remove.status).toBe(200)
})

test('registering a passkey requires recent authentication', async () => {
  const current = await addAccount()
  const old = new Date(Date.now() - 13 * 60 * 60 * 1000)
  await authDatabase().update(session).set({ createdAt: old }).where(eq(session.id, current.login.sessionId))

  const response = await post('/passkey/verify-registration', {}, current.login.cookie)
  expect(response.status).toBe(401)
  expect(await bodyCode(response)).toMatchObject({ code: 'reauth-required' })
})
