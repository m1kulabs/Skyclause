import { loadEnv } from '@skyclause/config'
import {
  draftEvidenceRequest,
  handleOnce,
  inboundProject,
  inboundSender,
  isFlagEnabled,
  recordAudit,
  systemPrincipal,
  withSystem,
  withTenant
} from '@skyclause/db'
import { onInbound, type InboundMessage } from '@skyclause/delivery'
import { log, type WorkerPart } from '../server'
import { evidenceSpanOf } from './span'

// #159 c-evidence, email intake (D7, LED-3): `{org}.{project}@{INBOUND_DOMAIN}` becomes an evidence request, while
// the global `inbound_email` flag is on. Only a confirmed subscriber of the project (the reply goes by email, after
// approval) or a member's account address (the reply stays in-app) may ask, with SPF or DKIM and the spam and virus
// scans passing. Anything else is dropped with an audit row and no reply.

const JOB = 'evidence-inbound'
const CONSUMER = 'evidence'
/** Two slugs and a domain; a Crowd reply's `r+{token}@…` never matches (#79 §8 D7). */
export const EVIDENCE_RECIPIENT = /^[a-z0-9-]+\.[a-z0-9-]+@[^@\s]+$/

type Drop = 'verdicts' | 'unknown_sender' | 'no_span'

export interface EvidenceInboundOptions {
  /** `INBOUND_DOMAIN`, read on each message. */
  inboundDomain?: () => string | undefined
  now?: () => Date
}

/** One inbound message for `evidence`; the router calls it at most once per SES message ID. */
export async function handleEvidenceMail(m: InboundMessage, o: EvidenceInboundOptions = {}) {
  const inboundDomain = o.inboundDomain ?? (() => loadEnv('worker').INBOUND_DOMAIN)
  const now = o.now ?? (() => new Date())
  if (!(await withSystem(JOB, (tx) => isFlagEnabled(tx, 'inbound_email')))) {
    log('INFO', 'inbound evidence mail ignored: inbound_email is off', { messageId: m.messageId })
    return
  }
  const [local = '', domain] = m.recipient.toLowerCase().split('@')
  const [orgSlug = '', projectSlug = ''] = local.split('.')
  const expected = inboundDomain()?.toLowerCase()
  const target =
    expected && domain === expected ? await withSystem(JOB, (tx) => inboundProject(tx, orgSlug, projectSlug)) : null
  if (!target) {
    // No organisation to audit in: logged only, without the address.
    log('INFO', 'inbound evidence mail dropped: no such project', { messageId: m.messageId })
    return
  }

  const ran = await withTenant({ orgId: target.orgId, principal: systemPrincipal(JOB) }, (tx) =>
    handleOnce(tx, CONSUMER, { messageId: m.messageId }, async () => {
      const drop = async (reason: Drop) => {
        await recordAudit(tx, {
          action: 'evidence_request.dropped',
          target: { type: 'inbound_email', id: m.messageId },
          projectId: target.projectId,
          after: { reason }
        })
        log('INFO', 'inbound evidence mail dropped', { messageId: m.messageId, reason })
      }
      const pass = (verdict: string) => verdict === 'PASS'
      const { spf, dkim, spam, virus } = m.verdicts
      if (!(pass(spf) || pass(dkim)) || !pass(spam) || !pass(virus)) return drop('verdicts')
      const sender = await inboundSender(tx, { orgId: target.orgId, projectId: target.projectId, address: m.from })
      if (!sender) return drop('unknown_sender')
      const line = m.text.split(/\r?\n/).find((text) => text.trim() !== '') ?? m.subject
      const receivedAt = new Date(m.receivedAt)
      const span = await evidenceSpanOf(tx, line, { receivedAt, timeZone: target.timeZone })
      if (!span) return drop('no_span')

      const subscriber = sender.kind === 'subscriber'
      const id = subscriber ? sender.subscriberId : sender.accountId
      const row = await draftEvidenceRequest(
        tx,
        {
          projectId: target.projectId,
          from: span.from,
          to: span.to,
          windowId: null,
          callId: null,
          requester: subscriber
            ? { kind: 'subscriber', id, accountId: null, subscriberId: id }
            : { kind: 'member', id, accountId: id, subscriberId: null },
          via: 'email',
          leavesOrg: subscriber,
          replyChannel: subscriber ? 'email' : 'in_app',
          receivedAt,
          messageId: m.messageId
        },
        now()
      )
      log('INFO', 'inbound evidence request drafted', { messageId: m.messageId, evidenceRequestId: row.id })
    })
  )
  if (!ran) log('INFO', 'inbound evidence mail already handled', { messageId: m.messageId })
}

/** c-evidence's part: registers the `evidence` inbound consumer on `register` (the delivery router's `onInbound`). */
export function createEvidencePart(o: EvidenceInboundOptions & { register?: typeof onInbound } = {}): WorkerPart {
  ;(o.register ?? onInbound)(EVIDENCE_RECIPIENT, CONSUMER, (m) => handleEvidenceMail(m, o))
  return { owner: 'c-evidence' }
}

export const evidence = createEvidencePart()
