import type { Principal, RecordAudit } from '@skyclause/contracts'
import type { Tx } from './client'
import { auditEvent } from './schema'

// #79 §1 recordAudit: the actor and client come from the transaction's principal, never the caller; no personal data.

const EMAIL = /[^\s@"]+@[^\s@"]+\.[^\s@"]+/

/** `audit_event.actor_type` and `actor_id` for a principal (TRD: account, API key, OAuth client, system). */
function actorOf(principal: Principal): { actorType: typeof auditEvent.$inferInsert.actorType; actorId: string } {
  switch (principal.kind) {
    case 'session':
      return { actorType: 'account', actorId: principal.accountId }
    case 'api_key':
      return { actorType: 'api_key', actorId: principal.keyId }
    case 'oauth':
      return { actorType: 'oauth_client', actorId: principal.clientId }
    case 'guest_token':
      return { actorType: 'guest_token', actorId: principal.tokenId }
    case 'share_link':
      return { actorType: 'share_link', actorId: principal.linkId }
    case 'device':
      return { actorType: 'device', actorId: principal.keyId }
    case 'system':
      return { actorType: 'system', actorId: principal.job }
  }
}

/** Throws if any key or string value anywhere in `value` looks like an email address. */
function refuseEmails(value: unknown, field: string) {
  const walk = (node: unknown): boolean => {
    if (typeof node === 'string') return EMAIL.test(node)
    if (Array.isArray(node)) return node.some(walk)
    if (node && typeof node === 'object')
      return Object.entries(node).some(([key, child]) => EMAIL.test(key) || walk(child))
    return false
  }
  if (walk(value)) throw new Error(`recordAudit: ${field} holds an email address; audit rows carry no personal data`)
}

/** One `audit_event` row in the transaction's organisation (`withTenant`). */
export const recordAudit: RecordAudit = async (handle, { action, target, projectId, before, after }) => {
  const tx = handle as Tx
  if (!tx.orgId) throw new Error('recordAudit needs a withTenant transaction')
  refuseEmails(before, 'before')
  refuseEmails(after, 'after')
  await tx.insert(auditEvent).values({
    orgId: tx.orgId,
    projectId,
    ...actorOf(tx.principal),
    client: tx.principal.client,
    clientName: tx.principal.clientName,
    action,
    targetType: target.type,
    targetId: target.id,
    before,
    after
  })
}
