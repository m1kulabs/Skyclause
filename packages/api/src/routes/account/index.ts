import type { Operations } from '@skyclause/contracts'
import type { Context } from 'hono'
import type { ApiEnv } from '../../context'
import { requireHumanSession, requireRecentAuth, principalOf } from '../../middleware/auth'
import { ApiError } from '../../problems'
import { countSignInMethods } from '@skyclause/db'
import { getAccountPreferences, updateAccountPreferences, updateMagicLinkEnabled } from '../../services/account'
import type { HandlerEntry } from '../index'

function sessionOf(c: Context<ApiEnv>) {
  const principal = principalOf(c)
  if (principal.kind !== 'session') throw new Error('requireSession must run first')
  return principal
}

const recentAuthWhenDisablingMagicLink = async (c: Context<ApiEnv>, next: () => Promise<void>) => {
  const value: unknown = await c.req.raw
    .clone()
    .json()
    .catch(() => undefined)
  if (
    typeof value === 'object' &&
    value !== null &&
    'magic_link_enabled' in value &&
    value.magic_link_enabled === false
  ) {
    return requireRecentAuth(12)(c, next)
  }
  await next()
}

export const accountHandlers: {
  getMyPreferences: HandlerEntry<Operations['getMyPreferences']>
  updateMyPreferences: HandlerEntry<Operations['updateMyPreferences']>
  updateMySecurity: HandlerEntry<Operations['updateMySecurity']>
} = {
  getMyPreferences: {
    handler: async (c) => {
      const preferences = await getAccountPreferences(sessionOf(c).accountId)
      if (!preferences) throw new ApiError(404, 'not-found', 'The account does not exist.')
      return c.json(preferences, 200)
    }
  },
  updateMyPreferences: {
    handler: async (c) => {
      const preferences = await updateAccountPreferences(sessionOf(c).accountId, c.req.valid('json'))
      if (!preferences) throw new ApiError(404, 'not-found', 'The account does not exist.')
      return c.json(preferences, 200)
    }
  },
  updateMySecurity: {
    middleware: [requireHumanSession, recentAuthWhenDisablingMagicLink],
    handler: async (c) => {
      const principal = sessionOf(c)
      const { magic_link_enabled } = c.req.valid('json')
      if (!magic_link_enabled) {
        const methods = await countSignInMethods(principal.accountId)
        if (!methods) throw new ApiError(404, 'not-found', 'The account does not exist.')
        if (!methods.passkeys && !methods.google) {
          throw new ApiError(
            409,
            'last-sign-in-method',
            'This is the only way to sign in. Add a passkey or link Google first.'
          )
        }
      }
      const updated = await updateMagicLinkEnabled(principal.accountId, magic_link_enabled)
      if (!updated) throw new ApiError(404, 'not-found', 'The account does not exist.')
      return c.json({ magic_link_enabled }, 200)
    }
  }
}
