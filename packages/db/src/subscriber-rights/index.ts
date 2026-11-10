import { type EraseSubscriber } from '@skyclause/contracts'
import { eq } from 'drizzle-orm'
import { recordAudit } from '../audit'
import { systemPrincipal, type Tx } from '../client'
import { subscriber, subscriberToken, suppression } from '../schema'
import { emailHash } from '../subscribers'

/** Pseudonymises a subscriber in place, preserving only an organisation-wide suppression hash and append-only history. */
export const eraseSubscriber: EraseSubscriber = async (handle, subscriberId) => {
  const tx = handle as Tx
  if (!tx.orgId) throw new Error('eraseSubscriber needs a withTenant transaction')

  const [current] = await tx.select().from(subscriber).where(eq(subscriber.id, subscriberId)).for('update')
  if (!current) return
  if (current.email === `${current.id}@deleted.invalid` && current.emailHash === null && current.unsubscribedAt) return

  const hash = emailHash(current.email)
  await tx
    .insert(suppression)
    .values({ orgId: tx.orgId, emailHash: hash, reason: 'unsubscribe' })
    .onConflictDoNothing({ target: [suppression.orgId, suppression.emailHash] })

  await tx.delete(subscriberToken).where(eq(subscriberToken.subscriberId, current.id))
  await tx
    .update(subscriber)
    .set({
      email: `${current.id}@deleted.invalid`,
      emailHash: null,
      role: null,
      windowIds: [],
      channels: [],
      language: '',
      confirmedAt: null,
      unsubscribedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(subscriber.id, current.id))

  // subscribe_link is project-scoped and has no subscriber foreign key; revoking it would break every subscriber.
  const actingPrincipal = tx.principal
  Object.assign(tx, { principal: systemPrincipal('subscriber-rights') })
  try {
    await recordAudit(tx, {
      action: 'subscriber.deleted',
      target: { type: 'subscriber', id: current.id },
      projectId: current.projectId
    })
  } finally {
    Object.assign(tx, { principal: actingPrincipal })
  }
}
