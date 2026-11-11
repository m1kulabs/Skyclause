import { createHash, createHmac, randomBytes } from 'node:crypto'
import type { EmailTransport } from '@skyclause/contracts'
import { requireEmailTransport } from '@skyclause/delivery'
import { authDatabase, hitStepUpLimit } from '@skyclause/db/auth'
import { passkey as passkeyRecord, session as sessionRecord, user, verification } from '@skyclause/db'
import { passkey } from '@better-auth/passkey'
import { createAuthEndpoint, createAuthMiddleware, APIError, sensitiveSessionMiddleware } from 'better-auth/api'
import type { BetterAuthPlugin } from 'better-auth'
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticatorTransport,
  type AuthenticationResponseJSON
} from '@simplewebauthn/server'
import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { withSendRefusal } from '../send-refusal'

const STEP_UP_WINDOW_S = 60 * 60
const STEP_UP_LIMIT = 10
const LINK_TTL_MS = 15 * 60 * 1000
const PASSKEY_TTL_MS = 5 * 60 * 1000
const RECENT_AUTH_MS = 12 * 60 * 60 * 1000
const EMPTY_BODY = z.object({})
const ASSERTION_BODY = z.object({ response: z.object({ id: z.string().min(1) }).passthrough() })
const CONFIRM_BODY = z.object({ token: z.string().min(1) })

interface StepUpSession {
  session: {
    id: string
    userId: string
    createdAt: Date
    expiresAt: Date
    reauthenticatedAt?: Date | null
  }
  user: { id: string; email: string; deletedAt?: Date | null }
}

export interface StepUpPluginOptions {
  appOrigin: string
  ipHashKey: string
  sendEmail?: EmailTransport['send']
}

function sessionOf(context: { context: { session?: unknown } }): StepUpSession {
  return context.context.session as StepUpSession
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('base64url')
}

function bucketHash(key: string, value: string) {
  return createHmac('sha256', key).update(value).digest('hex')
}

function ipOf(request: Request | undefined) {
  // Cloud Run appends the client address; earlier entries and other IP headers can be forged.
  return request?.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'unknown'
}

async function checkLimit(
  request: Request | undefined,
  accountId: string | undefined,
  o: StepUpPluginOptions,
  includeIp = true
) {
  const buckets = [...(accountId ? [`account:${accountId}`] : []), ...(includeIp ? [`ip:${ipOf(request)}`] : [])]
  const results = await Promise.all(
    buckets.map((bucket) =>
      hitStepUpLimit(bucketHash(o.ipHashKey, bucket), {
        limit: STEP_UP_LIMIT,
        windowS: STEP_UP_WINDOW_S,
        now: new Date()
      })
    )
  )
  if (results.some(({ allowed }) => !allowed)) {
    throw APIError.from('TOO_MANY_REQUESTS', {
      code: 'step-up-rate-limited',
      message: 'Too many step-up attempts. Try again later.'
    })
  }
}

function reauthRequired(): never {
  throw APIError.from('UNAUTHORIZED', {
    code: 'reauth-required',
    message: 'Sign in again to continue this sensitive action.'
  })
}

function expiredLink(appOrigin: string) {
  return new Response(null, {
    status: 303,
    headers: { Location: new URL('/sign-in?state=link-expired&for=step-up', appOrigin).toString() }
  })
}

async function authenticatedAtFor(sessionId: string, userId: string, now = new Date()) {
  const [session] = await authDatabase()
    .select({ createdAt: sessionRecord.createdAt, reauthenticatedAt: sessionRecord.reauthenticatedAt })
    .from(sessionRecord)
    .where(and(eq(sessionRecord.id, sessionId), eq(sessionRecord.userId, userId), gt(sessionRecord.expiresAt, now)))
    .limit(1)
  if (!session) reauthRequired()
  return session.reauthenticatedAt ?? session.createdAt
}

function htmlLink(url: string) {
  const escaped = url.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  return `<p>Confirm your Skyclause sign-in to continue a sensitive action.</p><p><a href="${escaped}">Continue</a></p><p>This link expires in 15 minutes and works once.</p>`
}

function stepUpEndpoints(o: StepUpPluginOptions) {
  const status = createAuthEndpoint('/step-up', { method: 'GET', use: [sensitiveSessionMiddleware] }, async (ctx) => {
    ctx.setHeader('Cache-Control', 'no-store')
    const { session, user: account } = sessionOf(ctx)
    const [credential] = await authDatabase()
      .select({ id: passkeyRecord.id })
      .from(passkeyRecord)
      .where(eq(passkeyRecord.userId, account.id))
      .limit(1)
    const authenticatedAt = await authenticatedAtFor(session.id, account.id)
    return ctx.json({
      fresh_until: new Date(authenticatedAt.getTime() + RECENT_AUTH_MS).toISOString(),
      passkey: !!credential
    })
  })

  const passkeyOptions = createAuthEndpoint(
    '/step-up/passkey/options',
    { method: 'POST', use: [sensitiveSessionMiddleware], body: EMPTY_BODY },
    async (ctx) => {
      const { session, user: account } = sessionOf(ctx)
      await checkLimit(ctx.request, account.id, o)
      const credentials = await authDatabase().select().from(passkeyRecord).where(eq(passkeyRecord.userId, account.id))
      if (!credentials.length) reauthRequired()

      const options = await generateAuthenticationOptions({
        rpID: new URL(o.appOrigin).hostname,
        userVerification: 'required',
        allowCredentials: credentials.map((credential) => ({
          id: credential.credentialID,
          ...(credential.transports ? { transports: credential.transports.split(',') as AuthenticatorTransport[] } : {})
        }))
      })
      const db = authDatabase()
      const identifier = `step-up:passkey:${session.id}`
      await db.delete(verification).where(eq(verification.identifier, identifier))
      await db.insert(verification).values({
        identifier,
        value: options.challenge,
        expiresAt: new Date(Date.now() + PASSKEY_TTL_MS)
      })
      return ctx.json({ options })
    }
  )

  const passkeyVerify = createAuthEndpoint(
    '/step-up/passkey/verify',
    { method: 'POST', use: [sensitiveSessionMiddleware], body: ASSERTION_BODY },
    async (ctx) => {
      const { session, user: account } = sessionOf(ctx)
      await checkLimit(ctx.request, account.id, o)
      const assertion = ctx.body.response as unknown as AuthenticationResponseJSON
      const [credential] = await authDatabase()
        .select()
        .from(passkeyRecord)
        .where(and(eq(passkeyRecord.userId, account.id), eq(passkeyRecord.credentialID, assertion.id)))
        .limit(1)
      if (!credential) reauthRequired()

      const now = new Date()
      const identifier = `step-up:passkey:${session.id}`
      const [challenge] = await authDatabase()
        .select()
        .from(verification)
        .where(and(eq(verification.identifier, identifier), gt(verification.expiresAt, now)))
        .orderBy(desc(verification.createdAt))
        .limit(1)
      if (!challenge) reauthRequired()
      const [consumed] = await authDatabase()
        .delete(verification)
        .where(and(eq(verification.id, challenge.id), gt(verification.expiresAt, now)))
        .returning({ id: verification.id })
      if (!consumed) reauthRequired()

      let verified: Awaited<ReturnType<typeof verifyAuthenticationResponse>>
      try {
        verified = await verifyAuthenticationResponse({
          response: assertion,
          expectedChallenge: challenge.value,
          expectedOrigin: o.appOrigin,
          expectedRPID: new URL(o.appOrigin).hostname,
          requireUserVerification: true,
          credential: {
            id: credential.credentialID,
            publicKey: Buffer.from(credential.publicKey, 'base64url'),
            counter: credential.counter,
            transports: credential.transports?.split(',') as AuthenticatorTransport[] | undefined
          }
        })
      } catch {
        reauthRequired()
      }
      if (!verified.verified) reauthRequired()

      const db = authDatabase()
      const updated = await db.transaction(async (tx) => {
        const [sessionUpdate] = await tx
          .update(sessionRecord)
          .set({ reauthenticatedAt: now })
          .where(
            and(
              eq(sessionRecord.id, session.id),
              eq(sessionRecord.userId, account.id),
              gt(sessionRecord.expiresAt, now)
            )
          )
          .returning({ id: sessionRecord.id })
        if (!sessionUpdate) return false
        await tx
          .update(passkeyRecord)
          .set({ counter: verified.authenticationInfo.newCounter })
          .where(eq(passkeyRecord.id, credential.id))
        return true
      })
      if (!updated) reauthRequired()
      return ctx.json({ fresh_until: new Date(now.getTime() + RECENT_AUTH_MS).toISOString() })
    }
  )

  const magicLink = createAuthEndpoint(
    '/step-up/magic-link',
    { method: 'POST', use: [sensitiveSessionMiddleware], body: EMPTY_BODY },
    async (ctx) => {
      const { session, user: account } = sessionOf(ctx)
      await checkLimit(ctx.request, account.id, o)
      const token = randomBytes(32).toString('base64url')
      const link = new URL('/sign-in', o.appOrigin)
      link.searchParams.set('link', token)
      link.searchParams.set('for', 'step-up')
      const identifier = `step-up:magic-link:${tokenHash(token)}`
      await authDatabase()
        .insert(verification)
        .values({
          identifier,
          value: JSON.stringify({ sessionId: session.id, userId: account.id }),
          expiresAt: new Date(Date.now() + LINK_TTL_MS)
        })
      try {
        const send = withSendRefusal(o.sendEmail ?? ((message) => requireEmailTransport('web').send(message)))
        await send({
          to: account.email,
          from: 'auth',
          subject: 'Confirm your Skyclause sign-in',
          text: `Confirm your Skyclause sign-in to continue a sensitive action.\n\n${link}\n\nThis link expires in 15 minutes and works once.`,
          html: htmlLink(link.toString()),
          category: 'step-up',
          idempotencyKey: `step-up-${tokenHash(token).slice(0, 40)}`
        })
      } catch (error) {
        await authDatabase().delete(verification).where(eq(verification.identifier, identifier))
        throw error
      }
      return ctx.json({ sent: true })
    }
  )

  const magicLinkConfirm = createAuthEndpoint(
    '/step-up/magic-link/confirm',
    { method: 'POST', body: CONFIRM_BODY },
    async (ctx) => {
      await checkLimit(ctx.request, undefined, o)
      const now = new Date()
      const identifier = `step-up:magic-link:${tokenHash(ctx.body.token)}`
      const [token] = await authDatabase()
        .select()
        .from(verification)
        .where(eq(verification.identifier, identifier))
        .limit(1)
      if (!token) return expiredLink(o.appOrigin)
      if (token.expiresAt <= now) {
        await authDatabase().delete(verification).where(eq(verification.id, token.id))
        return expiredLink(o.appOrigin)
      }

      let bound: { sessionId: string; userId: string }
      try {
        bound = JSON.parse(token.value) as { sessionId: string; userId: string }
      } catch {
        return expiredLink(o.appOrigin)
      }
      const [account] = await authDatabase()
        .select({ id: user.id })
        .from(user)
        .where(and(eq(user.id, bound.userId), isNull(user.deletedAt)))
        .limit(1)
      if (!account) return expiredLink(o.appOrigin)
      await checkLimit(ctx.request, account.id, o, false)

      const confirmed = await authDatabase().transaction(async (tx) => {
        const [activeSession] = await tx
          .select({ id: sessionRecord.id })
          .from(sessionRecord)
          .where(
            and(
              eq(sessionRecord.id, bound.sessionId),
              eq(sessionRecord.userId, bound.userId),
              gt(sessionRecord.expiresAt, now)
            )
          )
          .limit(1)
        if (!activeSession) return false
        const [spent] = await tx
          .delete(verification)
          .where(and(eq(verification.id, token.id), gt(verification.expiresAt, now)))
          .returning({ id: verification.id })
        if (!spent) return false
        const [updated] = await tx
          .update(sessionRecord)
          .set({ reauthenticatedAt: now })
          .where(and(eq(sessionRecord.id, bound.sessionId), eq(sessionRecord.userId, bound.userId)))
          .returning({ id: sessionRecord.id })
        if (!updated) throw new Error('Bound step-up session disappeared during confirmation')
        return true
      })
      if (!confirmed) return expiredLink(o.appOrigin)
      return ctx.json({ confirmed: true })
    }
  )

  return { status, passkeyOptions, passkeyVerify, magicLink, magicLinkConfirm }
}

export function aStepUp(o: StepUpPluginOptions): BetterAuthPlugin {
  const configuredPasskey = passkey({
    rpID: new URL(o.appOrigin).hostname,
    rpName: 'Skyclause',
    origin: o.appOrigin,
    registration: { requireSession: true },
    authenticatorSelection: { userVerification: 'required' }
  })
  const recentAuthentication = createAuthMiddleware(async (ctx) => {
    const { session, user: account } = sessionOf(ctx)
    const authenticatedAt = await authenticatedAtFor(session.id, account.id)
    if (Date.now() - authenticatedAt.getTime() > RECENT_AUTH_MS) reauthRequired()
  })
  const registerOptions = configuredPasskey.endpoints.generatePasskeyRegistrationOptions
  const verifyRegistration = configuredPasskey.endpoints.verifyPasskeyRegistration
  Object.assign(registerOptions.options, {
    use: [...(registerOptions.options.use ?? []), recentAuthentication]
  })
  Object.assign(verifyRegistration.options, {
    use: [...(verifyRegistration.options.use ?? []), recentAuthentication]
  })
  return {
    ...configuredPasskey,
    endpoints: { ...configuredPasskey.endpoints, ...stepUpEndpoints(o) }
  }
}
