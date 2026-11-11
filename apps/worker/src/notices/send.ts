import type { EmailTransport } from '@skyclause/contracts'
import {
  claimCallNotice,
  emailHash,
  isSuppressed,
  issueSubscriberToken,
  leaseCallNotice,
  projectGate,
  recordCallNotice,
  settleCall,
  systemPrincipal,
  withTenant,
  type CallNoticeOutcome,
  type ClaimedNotice,
  type Tx
} from '@skyclause/db'
import { callNoticeEmail } from '@skyclause/delivery'
import { log } from '../server'

// #158 c-sender-email: sending an organisation's queued `call` notices (TRD "Channels and sends"). Each notice is
// claimed and checked in one transaction, which also takes its lease and mints its links; Resend is called outside any
// transaction; a second transaction records the answer. Then each call whose notices have settled is settled.

export interface SenderConfig {
  /** `APP_ORIGIN`: the subscriber pages and the one-click route. */
  appOrigin?: string
  /** `MARKETING_ORIGIN`: the permalink `/c/{callId}` (D33). */
  marketingOrigin?: string
  /** `INBOUND_DOMAIN`: a Crowd notice's `Reply-To` (D7). */
  inboundDomain?: string
}

export interface SenderDeps {
  /** Resend, or null while its sending variables are unset and email is off. */
  email: () => EmailTransport | null
  config: () => SenderConfig
  now: () => Date
}

const principal = systemPrincipal('sender')
const APPROVING_ROLES = ['owner', 'admin', 'approver'] as const
type ApprovingRole = (typeof APPROVING_ROLES)[number]
const isApprovingRole = (role: string | null): role is ApprovingRole =>
  (APPROVING_ROLES as readonly (string | null)[]).includes(role)

/**
 * The checks before a send, in the ticket's order: a project that isn't `open` sends nothing and keeps the notice
 * `queued` (PRJ-8, D36); a call past `expires_at` is never sent (CAL-8); a missing, unconfirmed or unsubscribed
 * subscriber (NTC-8, NTC-9) or a suppressed address (NTC-9, NTC-10) ends `suppressed`.
 */
async function check(tx: Tx, c: ClaimedNotice, now: Date): Promise<'held' | 'expired' | 'suppressed' | 'send'> {
  if ((await projectGate(tx, c.notice.projectId)) !== 'open') return 'held'
  if (c.callExpiresAt <= now) return 'expired'
  const s = c.subscriber
  if (!s || !s.confirmed || s.unsubscribed) return 'suppressed'
  if (await isSuppressed(tx, emailHash(s.email))) return 'suppressed'
  return 'send'
}

interface Ready {
  transport: EmailTransport
  config: Required<Pick<SenderConfig, 'appOrigin' | 'marketingOrigin'>> & SenderConfig
  tokens: { manage: string; unsubscribe: string; reply?: string }
}

/** What a send can't go without, checked before its lease, so a missing setting costs no attempt. */
function readiness(deps: SenderDeps, c: ClaimedNotice): Omit<Ready, 'tokens'> {
  const transport = deps.email()
  if (!transport)
    throw new Error('email is off: RESEND_SENDING_API_KEY, EMAIL_FROM_AUTH and EMAIL_FROM_NOTICES are unset')
  const config = deps.config()
  const { appOrigin, marketingOrigin } = config
  if (!appOrigin || !marketingOrigin) throw new Error('APP_ORIGIN and MARKETING_ORIGIN must be set to send notices')
  if (c.pack === 'crowd' && !config.inboundDomain) throw new Error('INBOUND_DOMAIN must be set to send Crowd notices')
  return { transport, config: { ...config, appOrigin, marketingOrigin } }
}

/** Fresh `manage` and `unsubscribe` tokens, and a Crowd notice's `reply` token, bound to the call and its window. */
async function mintTokens(tx: Tx, c: ClaimedNotice): Promise<Ready['tokens']> {
  const t = { subscriberId: c.subscriber!.id, callId: c.call.id, windowId: c.call.window_id ?? undefined }
  return {
    manage: await issueSubscriberToken(tx, { ...t, purpose: 'manage' }),
    unsubscribe: await issueSubscriberToken(tx, { ...t, purpose: 'unsubscribe' }),
    ...(c.pack === 'crowd' ? { reply: await issueSubscriberToken(tx, { ...t, purpose: 'reply' }) } : {})
  }
}

/** Renders and hands one notice to Resend; any failure, an empty message ID included, is a retry. */
async function deliver(c: ClaimedNotice, ready: Ready): Promise<CallNoticeOutcome> {
  try {
    const message = callNoticeEmail(c.call, {
      to: c.subscriber!.email,
      language: c.notice.language,
      idempotencyKey: c.notice.idempotencyKey,
      tokens: ready.tokens,
      origins: { app: ready.config.appOrigin, marketing: ready.config.marketingOrigin },
      inboundDomain: ready.config.inboundDomain,
      project: { name: c.projectName },
      window: c.span ? { startsAt: c.span.startsAt.toISOString(), endsAt: c.span.endsAt.toISOString() } : undefined,
      approver: isApprovingRole(c.approverRole) ? { role: c.approverRole } : undefined,
      sources: c.sources
    })
    const { providerMessageId } = await ready.transport.send(message)
    if (!providerMessageId) throw new Error('the provider answered without a message ID')
    return { status: 'sent', providerMessageId }
  } catch (error) {
    log('ERROR', 'call notice send failed', {
      notice_id: c.notice.id,
      attempt: c.notice.attempts + 1,
      error: error instanceof Error ? error.message : String(error)
    })
    return { status: 'retry' }
  }
}

/**
 * Sends the organisation's queued `call` notices (only `callIds`' when given), one claim at a time in ID order, until
 * none is left that this run hasn't seen; another sender's rows are skipped, never waited on. Returns the calls whose
 * notices it touched. Throws on anything but a send failure, which `recordCallNotice` turns into a retry.
 */
export async function sendCallNotices(
  deps: SenderDeps,
  orgId: string,
  q: { callIds?: string[] } = {}
): Promise<Set<string>> {
  const touched = new Set<string>()
  let after: string | undefined
  for (;;) {
    const now = deps.now()
    const claimed = await withTenant({ orgId, principal }, async (tx) => {
      const c = await claimCallNotice(tx, { now, after, callIds: q.callIds })
      if (!c) return null
      const verdict = await check(tx, c, now)
      if (verdict === 'held') return { c, ready: null }
      if (verdict !== 'send') {
        await recordCallNotice(tx, c, { status: verdict }, now)
        return { c, ready: null }
      }
      const ready = readiness(deps, c)
      await leaseCallNotice(tx, c.notice.id, now)
      return { c, ready: { ...ready, tokens: await mintTokens(tx, c) } }
    })
    if (!claimed) return touched
    const { c, ready } = claimed
    after = c.notice.id
    touched.add(c.call.id)
    if (!ready) continue
    const outcome = await deliver(c, ready)
    await withTenant({ orgId, principal }, (tx) => recordCallNotice(tx, c, outcome, deps.now()))
  }
}

/** Settles each call whose notices have all left `queued` (`settleCall`), one transaction per call. */
export async function settleCalls(deps: SenderDeps, orgId: string, callIds: Iterable<string>) {
  for (const callId of callIds) {
    await withTenant({ orgId, principal }, (tx) => settleCall(tx, callId, deps.now()))
  }
}
