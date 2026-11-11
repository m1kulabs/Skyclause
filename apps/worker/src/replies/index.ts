import { loadEnv } from '@skyclause/config'
import { onInbound, requireEmailTransport } from '@skyclause/delivery'
import type { WorkerPart } from '../server'
import { planFeedbackConsumer, type FeedbackDeps } from './feedback'
import { CROWD_REPLY_RECIPIENT, handleCrowdReply } from './inbound'

export { CROWD_REPLY_RECIPIENT, handleCrowdReply } from './inbound'

// #163 (c-recipient-replies): replies to Crowd notices by email (D7, CAL-17), and the plan-feedback email after a
// graded Sky window (ANL-7).

const productionDeps: FeedbackDeps = {
  email: () => requireEmailTransport('worker'),
  appOrigin: () => {
    const origin = loadEnv('worker').APP_ORIGIN
    if (!origin) throw new Error('APP_ORIGIN is not set')
    return origin
  }
}

export function createRepliesPart(deps: FeedbackDeps = productionDeps): WorkerPart {
  return { owner: 'c-recipient-replies', events: [planFeedbackConsumer(deps)] }
}

export const replies = createRepliesPart()

// Registered at import without reading any mail setting, since Cloud Run jobs import the same parts without the
// worker's; the handler reads INBOUND_DOMAIN through the env loader on each message.
onInbound(CROWD_REPLY_RECIPIENT, 'crowd-replies', (m) => handleCrowdReply(m))
