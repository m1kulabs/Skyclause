import { loadEnv } from '@skyclause/config'
import type { EmailTransport } from '@skyclause/contracts'
import { emailTransportForAws, onInbound } from '@skyclause/delivery'
import type { WorkerPart } from '../server'
import { planFeedbackConsumer, type FeedbackDeps } from './feedback'
import { crowdReplyRecipient, handleCrowdReply } from './inbound'

export { crowdReplyRecipient, handleCrowdReply } from './inbound'

// #163 (c-recipient-replies): replies to Crowd notices by email (D7, CAL-17), and the plan-feedback email after a
// graded Sky window (ANL-7).

let ses: EmailTransport | undefined

/** SES as the worker (#113), built on the first send; until gate 4B its variables are unset and mail is off. */
function loadEmail(): EmailTransport {
  const { SES_REGION, AWS_ROLE_ARN, SES_CONFIGURATION_SET, EMAIL_FROM_AUTH, EMAIL_FROM_NOTICES } = loadEnv('worker')
  if (!SES_REGION || !AWS_ROLE_ARN || !SES_CONFIGURATION_SET || !EMAIL_FROM_AUTH || !EMAIL_FROM_NOTICES) {
    throw new Error('email is off: the SES variables are unset until gate 4B')
  }
  return emailTransportForAws({
    region: SES_REGION,
    roleArn: AWS_ROLE_ARN,
    configurationSet: SES_CONFIGURATION_SET,
    fromAuth: EMAIL_FROM_AUTH,
    fromNotices: EMAIL_FROM_NOTICES
  })
}

const productionDeps: FeedbackDeps = {
  email: () => (ses ??= loadEmail()),
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
