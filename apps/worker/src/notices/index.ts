import { loadEnv } from '@skyclause/config'
import { BundleApprovedEventSchema, type EmailTransport, type EventEnvelope } from '@skyclause/contracts'
import {
  NOTICE_KINDS,
  noticeForProviderMessage,
  noticeOrgsToSweep,
  recordDeliveryEvent,
  sendingCallIds,
  systemPrincipal,
  withSystem,
  withTenant
} from '@skyclause/db'
import { emailTransportForAws, sesEventsHandler, type SesEvent } from '@skyclause/delivery'
import { log, type WorkerPart } from '../server'
import { sendCallNotices, settleCalls, type SenderConfig, type SenderDeps } from './send'

// #158 c-sender-email's part: consumer `sender` on `bundle.approved`, the `notice-sweep` in the 15-minute batch (D45:
// the minute tick never touches Postgres) that retries failed sends and settles calls, and `POST /ses/events`.

export interface NoticesDeps extends SenderDeps {
  config: () => SenderConfig & {
    /** `SES_REGION` */
    sesRegion?: string
    /** `SES_EVENTS_SNS_TOPIC_ARN` */
    eventsTopicArn?: string
  }
  /** Tests only: the SNS certificate fetch and the subscription confirmation. */
  certificate?: (url: string) => Promise<string>
  fetch?: typeof fetch
}

/** How far back the sweep looks for calls to settle: a settle that failed after a call's last send is retried. */
const SETTLE_LOOKBACK_MS = 24 * 60 * 60_000

export function createNoticesPart(deps: NoticesDeps): WorkerPart {
  const sesEvents = systemPrincipal('ses-events')

  async function apply(event: SesEvent): Promise<boolean> {
    const found = await withSystem('ses-events', (tx) => noticeForProviderMessage(tx, event.providerMessageId))
    // Mail with no outbox row (sign-in links) is acknowledged; a notice's event can beat its send's record.
    if (!found) return !(event.category && NOTICE_KINDS.includes(event.category))
    const moved = await withTenant({ orgId: found.orgId, principal: sesEvents }, (tx) =>
      recordDeliveryEvent(tx, found.id, event, deps.now())
    )
    log('INFO', 'ses event recorded', { notice_id: found.id, type: event.type, moved })
    return true
  }

  let handleEvents: ((request: Request) => Promise<Response>) | undefined
  return {
    owner: 'c-sender-email',
    events: [
      {
        // Not `onEvent`: its one transaction would hold every send. The claim makes a redelivery safe instead.
        consumer: 'sender',
        types: ['bundle.approved'],
        handler: async (raw) => {
          const event = raw as EventEnvelope
          const { sending_call_ids } = BundleApprovedEventSchema.shape.data.parse(event.data)
          await sendCallNotices(deps, event.org_id, { callIds: sending_call_ids })
          await settleCalls(deps, event.org_id, sending_call_ids)
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
            const calls = await withTenant({ orgId, principal: systemPrincipal('sender') }, sendingCallIds)
            await settleCalls(deps, orgId, calls)
          } catch (error) {
            failed.push(`${orgId}: ${String(error)}`)
          }
        }
        if (failed.length) throw new Error(`notice sweep failed for ${failed.join('; ')}`)
      }
    },
    ses: {
      '/events': async (request) => {
        if (!handleEvents) {
          const { sesRegion, eventsTopicArn } = deps.config()
          if (!sesRegion || !eventsTopicArn) return new Response('SES events are not configured', { status: 503 })
          handleEvents = sesEventsHandler({
            topicArn: eventsTopicArn,
            region: sesRegion,
            certificate: deps.certificate,
            fetch: deps.fetch,
            apply
          })
        }
        return handleEvents(request)
      }
    }
  }
}

let transport: EmailTransport | undefined

export const notices = createNoticesPart({
  email: () => {
    const env = loadEnv('worker')
    if (!env.SES_REGION || !env.AWS_ROLE_ARN || !env.SES_CONFIGURATION_SET) return null
    return (transport ??= emailTransportForAws({
      region: env.SES_REGION,
      roleArn: env.AWS_ROLE_ARN,
      configurationSet: env.SES_CONFIGURATION_SET,
      fromAuth: env.EMAIL_FROM_AUTH!,
      fromNotices: env.EMAIL_FROM_NOTICES!
    }))
  },
  config: () => {
    const env = loadEnv('worker')
    return {
      appOrigin: env.APP_ORIGIN,
      marketingOrigin: env.MARKETING_ORIGIN,
      inboundDomain: env.INBOUND_DOMAIN,
      sesRegion: env.SES_REGION,
      eventsTopicArn: env.SES_EVENTS_SNS_TOPIC_ARN
    }
  },
  now: () => new Date()
})
