import { loadEnv } from '@skyclause/config'
import { BundleApprovedEventSchema, type EventEnvelope } from '@skyclause/contracts'
import {
  NOTICE_KINDS,
  noticeForProviderMessage,
  noticeOrgsToSweep,
  recordDeliveryEvent,
  sendingCallIds,
  settleBundle,
  systemPrincipal,
  withSystem,
  withTenant
} from '@skyclause/db'
import { DELIVERY_EVENT_TYPES, deliveryEvent, emailTransportFromEnv, type DeliveryEvent } from '@skyclause/delivery'
import { log, type ResendHandler, type WorkerPart } from '../server'
import { sendCallNotices, settleCalls, type SenderDeps } from './send'

// #158 c-sender-email's part: consumer `sender` on `bundle.approved`, the `notice-sweep` in the 15-minute batch (D45:
// the minute tick never touches Postgres) that retries failed sends and settles calls, and Resend's delivery events
// from `POST /resend/webhook` (#656).

export type NoticesDeps = SenderDeps

/** How far back the sweep looks for calls to settle: a settle that failed after a call's last send is retried. */
const SETTLE_LOOKBACK_MS = 24 * 60 * 60_000

export function createNoticesPart(deps: NoticesDeps): WorkerPart {
  const deliveryEvents = systemPrincipal('delivery-events')
  const sender = systemPrincipal('sender')

  async function apply(event: DeliveryEvent): Promise<boolean> {
    const found = await withSystem('delivery-events', (tx) => noticeForProviderMessage(tx, event.providerMessageId))
    // Mail with no outbox row (sign-in links) is acknowledged; a notice's event can beat its send's record.
    if (!found) return !(event.category && NOTICE_KINDS.includes(event.category))
    if (found.orgId === null && found.kind !== 'export_ready') {
      throw new Error(`notice ${found.id} is missing org_id`)
    }
    const moved =
      found.orgId === null
        ? await withSystem('delivery-events', (tx) => recordDeliveryEvent(tx, found.id, event, deps.now()))
        : await withTenant({ orgId: found.orgId, principal: deliveryEvents }, (tx) =>
            recordDeliveryEvent(tx, found.id, event, deps.now())
          )
    log('INFO', 'delivery event recorded', { notice_id: found.id, type: event.type, moved })
    return true
  }

  // A notice's event can beat its send's record: 503 makes Resend retry it. Anything else is acknowledged with 200, the
  // only answer Resend counts as delivered.
  const onDeliveryEvent: ResendHandler = async (webhook) => {
    const event = deliveryEvent(webhook)
    if (event && !(await apply(event))) return new Response('send not recorded yet', { status: 503 })
    return new Response(null, { status: 200 })
  }

  return {
    owner: 'c-sender-email',
    events: [
      {
        // Not `onEvent`: its one transaction would hold every send. The claim makes a redelivery safe instead.
        consumer: 'sender',
        types: ['bundle.approved'],
        handler: async (raw) => {
          const event = raw as EventEnvelope
          const { bundle_id, sending_call_ids } = BundleApprovedEventSchema.shape.data.parse(event.data)
          await sendCallNotices(deps, event.org_id, { callIds: sending_call_ids })
          await settleCalls(deps, event.org_id, sending_call_ids)
          // #153 leaves a bundle whose every call it rejected `approved`, with nothing to wait for.
          if (!sending_call_ids.length) {
            await withTenant({ orgId: event.org_id, principal: sender }, (tx) =>
              settleBundle(tx, bundle_id, deps.now())
            )
          }
        }
      }
    ],
    batch: {
      'notice-sweep': async () => {
        const since = new Date(deps.now().getTime() - SETTLE_LOOKBACK_MS)
        const orgIds = await withSystem('notice-sweep', (tx) => noticeOrgsToSweep(tx, since))
        const failed: string[] = []
        for (const orgId of orgIds) {
          try {
            await sendCallNotices(deps, orgId)
            const calls = await withTenant({ orgId, principal: sender }, sendingCallIds)
            await settleCalls(deps, orgId, calls)
          } catch (error) {
            failed.push(`${orgId}: ${String(error)}`)
          }
        }
        if (failed.length) throw new Error(`notice sweep failed for ${failed.join('; ')}`)
      }
    },
    resend: Object.fromEntries(DELIVERY_EVENT_TYPES.map((type) => [type, onDeliveryEvent]))
  }
}

export const notices = createNoticesPart({
  email: () => emailTransportFromEnv('worker'),
  config: () => {
    const env = loadEnv('worker')
    return {
      appOrigin: env.APP_ORIGIN,
      marketingOrigin: env.MARKETING_ORIGIN,
      inboundDomain: env.INBOUND_DOMAIN
    }
  },
  now: () => new Date()
})
