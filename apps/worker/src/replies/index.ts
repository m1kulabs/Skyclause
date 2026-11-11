import { loadEnv } from '@skyclause/config'
import { onInbound, requireEmailTransport } from '@skyclause/delivery'
import type { WorkerPart } from '../server'
import { planFeedbackConsumer, type FeedbackDeps } from './feedback'
import { crowdReplyRecipient, handleCrowdReply } from './inbound'

export { crowdReplyRecipient, handleCrowdReply } from './inbound'

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

// `/ses/inbound` answers 503 until gate 4B sets every inbound variable together, INBOUND_DOMAIN among them.
const domain = process.env.INBOUND_DOMAIN
if (domain) onInbound(crowdReplyRecipient(domain), 'crowd-replies', handleCrowdReply)
