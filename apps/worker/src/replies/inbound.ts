import type { InboundMessage } from '@skyclause/delivery'
import {
  isFlagEnabled,
  normalizeEmail,
  recordCrowdReply,
  recordReplyDrop,
  replySender,
  systemPrincipal,
  verifySubscriberToken,
  withSystem,
  withTenant,
  type CrowdReplyKind,
  type ReplyDropReason,
  type Tx
} from '@skyclause/db'
import { log } from '../server'

// #163 (c-recipient-replies), D7: a reply to a Crowd notice's `Reply-To: r+{token}@{INBOUND_DOMAIN}` (#158 mints the
// `reply` token). Logs name the SES message ID only, never the address, token or text.

const CONSUMER = 'crowd-replies'
const principal = systemPrincipal(`inbound:${CONSUMER}`)

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The `onInbound` pattern for `r+{token}@{domain}`, matched against the lower-cased address. */
export const crowdReplyRecipient = (domain: string) =>
  new RegExp(`^r\\+[A-Za-z0-9_-]{43}@${escapeRegExp(domain.toLowerCase())}$`)

const COMMAND = /^(keep|shuttle|shift\s+to\s+(\d{1,2}):([0-5]\d))$/i

/** The first unquoted line's answer, case-insensitive: `keep`, `shuttle` or `shift to HH:MM` (24-hour); else null. */
function parseReply(text: string): { kind: CrowdReplyKind; shiftTo: string | null } | null {
  const line = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l !== '' && !l.startsWith('>'))
  const match = line ? COMMAND.exec(line) : null
  if (!match) return null
  const [, command, hours, minutes] = match
  if (hours === undefined) return { kind: command!.toLowerCase() as 'keep' | 'shuttle', shiftTo: null }
  return Number(hours) > 23 ? null : { kind: 'shift', shiftTo: `${hours.padStart(2, '0')}:${minutes}` }
}

/** Why a reply whose token verified isn't logged, or null when it can be. */
function dropReason(m: InboundMessage, sender: string, readable: boolean): ReplyDropReason | null {
  if (m.verdicts.spam !== 'PASS' || m.verdicts.virus !== 'PASS') return 'verdict'
  if (normalizeEmail(m.from) !== normalizeEmail(sender)) return 'sender'
  return readable ? null : 'unparsed'
}

/**
 * Logs the reply in the token's organisation (CAL-17), at SES's receipt time. Mail needs spam and virus `PASS`, a
 * sender equal to the token's subscriber and a readable first line; otherwise it is dropped with an audit row and the
 * token keeps its one reply. With `inbound_email` or `pack_crowd` off, or a token that doesn't verify, nothing is
 * written. A redelivery finds the token spent, or the drop already audited.
 */
export async function handleCrowdReply(m: InboundMessage): Promise<void> {
  const notLogged = (outcome: string) => log('INFO', 'crowd reply not logged', { message_id: m.messageId, outcome })
  if (!(await withSystem(principal.job, (tx) => isFlagEnabled(tx, 'inbound_email')))) return notLogged('inbound-off')
  const token = /^r\+([A-Za-z0-9_-]+)@/.exec(m.recipient)?.[1]
  const found = token ? await verifySubscriberToken(token, 'reply') : null
  if (!found?.callId || !found.windowId) return notLogged('token')
  const { callId, windowId } = found

  const outcome = await withTenant({ orgId: found.orgId, principal }, async (tx: Tx) => {
    if (!(await isFlagEnabled(tx, 'pack_crowd', found.orgId))) return 'crowd-off'
    const sender = await replySender(tx, found.subscriberId)
    if (sender === null) return 'token'
    const reply = parseReply(m.text)
    const dropped = dropReason(m, sender, reply !== null)
    if (dropped) {
      await recordReplyDrop(tx, { projectId: found.projectId, messageId: m.messageId, reason: dropped })
      return `dropped-${dropped}`
    }
    const at = new Date(m.receivedAt)
    const recorded = await recordCrowdReply(tx, { ...found, callId, windowId, ...reply!, at })
    return typeof recorded === 'string' ? recorded : 'logged'
  })
  if (outcome === 'logged') log('INFO', 'crowd reply logged', { message_id: m.messageId })
  else notLogged(outcome)
}
