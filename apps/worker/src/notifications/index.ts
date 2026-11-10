import { can } from '@skyclause/auth'
import {
  BundleEscalatedEventSchema,
  BundleNeedsReviewEventSchema,
  ReviewItemOpenedEventSchema,
  SourceErrorEventSchema,
  type Principal,
  type Role
} from '@skyclause/contracts'
import { notify, orgMembers, type Tx } from '@skyclause/db'
import { onEvent } from '../events'
import { nextApprovers } from '../placeholders/a-members-api'
import type { WorkerPart } from '../server'

// #156 (c-notifications): §5's consumer `notifications`. Each event becomes in-app items through `notify`, whose unread
// dedupe and `handleOnce` make a redelivery add none.

/** #103's `nextApprovers` (D22): the accounts a next-approver escalation of the bundle reaches at `at`. */
export type NextApprovers = (tx: Tx, q: { projectId: string; bundleId: string; at: Date }) => Promise<string[]>

/** "Admins" in an escalation: the same accounts #155 alerts at the `admins` level. */
const ADMINS: Role[] = ['owner', 'admin']

/** A member as `can` sees them signed in to the organisation. */
const asMember = (orgId: string, m: { accountId: string; role: Role }): Principal => ({
  kind: 'session',
  via: 'cookie',
  client: 'app',
  clientName: null,
  accountId: m.accountId,
  sessionId: '',
  isGuest: m.role === 'guest',
  staff: false,
  orgId,
  role: m.role,
  authenticatedAt: new Date(0)
})

async function approvers(tx: Tx, projectId: string) {
  const members = await orgMembers(tx)
  return members.filter((m) => can(asMember(tx.orgId!, m), 'bundle.approve', { projectId })).map((m) => m.accountId)
}

async function admins(tx: Tx) {
  return (await orgMembers(tx)).filter((m) => ADMINS.includes(m.role)).map((m) => m.accountId)
}

export function notificationsPart(deps: { nextApprovers: NextApprovers }): WorkerPart {
  return {
    owner: 'c-notifications',
    events: [
      onEvent(
        ['bundle.needs_review', 'bundle.escalated', 'source.error', 'review_item.opened'],
        'notifications',
        async (event, tx) => {
          const projectId = event.project_id
          switch (event.type) {
            case 'bundle.needs_review': {
              const { bundle_id } = BundleNeedsReviewEventSchema.shape.data.parse(event.data)
              const accountIds = await approvers(tx, projectId)
              return notify(tx, { accountIds, kind: 'needs_review', ref: { type: 'bundle', id: bundle_id }, projectId })
            }
            case 'bundle.escalated': {
              const { bundle_id: bundleId, level } = BundleEscalatedEventSchema.shape.data.parse(event.data)
              const accountIds =
                level === 'admins'
                  ? await admins(tx)
                  : await deps.nextApprovers(tx, { projectId, bundleId, at: new Date(event.created_at) })
              return notify(tx, { accountIds, kind: 'escalated', ref: { type: 'bundle', id: bundleId }, projectId })
            }
            case 'source.error': {
              const { source_id } = SourceErrorEventSchema.shape.data.parse(event.data)
              const accountIds = (await orgMembers(tx)).map((m) => m.accountId)
              return notify(tx, { accountIds, kind: 'source_error', ref: { type: 'source', id: source_id }, projectId })
            }
            case 'review_item.opened': {
              const { review_item_id } = ReviewItemOpenedEventSchema.shape.data.parse(event.data)
              const accountIds = await approvers(tx, projectId)
              return notify(tx, {
                accountIds,
                kind: 'review_item',
                ref: { type: 'review_item', id: review_item_id },
                projectId
              })
            }
          }
        }
      )
    ]
  }
}

export const notifications = notificationsPart({ nextApprovers })
