import { and, eq } from 'drizzle-orm'
import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import { account, passkey } from '@skyclause/db'
import { authDatabase, countSignInMethods } from '@skyclause/db/auth'

const RECENT_AUTH_MS = 12 * 60 * 60 * 1000

function lastSignInMethod(): never {
  throw APIError.from('CONFLICT', {
    code: 'last-sign-in-method',
    message: 'This is the only way to sign in. Add a passkey or link Google first.'
  })
}

function reauthRequired(): never {
  throw APIError.from('UNAUTHORIZED', {
    code: 'reauth-required',
    message: 'Sign in again to continue this sensitive action.'
  })
}

export const aAccountSettings: BetterAuthPlugin = {
  id: 'a-account-settings',
  hooks: {
    before: [
      {
        matcher: (context) =>
          context.path === '/passkey/verify-registration' ||
          context.path === '/passkey/delete-passkey' ||
          context.path === '/unlink-account',
        handler: createAuthMiddleware(async (context) => {
          const current = await getSessionFromCtx(context, { disableRefresh: true })
          if (!current) return

          if (context.path === '/passkey/verify-registration') {
            const authenticatedAt = current.session.reauthenticatedAt ?? current.session.createdAt
            if (Date.now() - authenticatedAt.getTime() > RECENT_AUTH_MS) reauthRequired()
            return
          }

          if (context.path === '/unlink-account') {
            const accountId = (context.body as { accountId?: string } | undefined)?.accountId
            if (!accountId) return
            const [target] = await authDatabase()
              .select({ providerId: account.providerId })
              .from(account)
              .where(and(eq(account.id, accountId), eq(account.userId, current.user.id)))
              .limit(1)
            if (target?.providerId !== 'google') return

            const authenticatedAt = current.session.reauthenticatedAt ?? current.session.createdAt
            if (Date.now() - authenticatedAt.getTime() > RECENT_AUTH_MS) reauthRequired()

            const methods = await countSignInMethods(current.user.id)
            if (methods?.google === 1 && !methods.magicLinkEnabled && !methods.passkeys) lastSignInMethod()
            return
          }

          const passkeyId = (context.body as { id?: string } | undefined)?.id
          if (!passkeyId) return
          const [target] = await authDatabase()
            .select({ id: passkey.id })
            .from(passkey)
            .where(and(eq(passkey.id, passkeyId), eq(passkey.userId, current.user.id)))
            .limit(1)
          if (!target) return

          const methods = await countSignInMethods(current.user.id)
          if (methods?.passkeys === 1 && !methods.magicLinkEnabled && !methods.google) lastSignInMethod()
        })
      }
    ]
  }
}
