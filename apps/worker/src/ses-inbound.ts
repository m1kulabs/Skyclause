import { loadEnv, type Env } from '@skyclause/config'
import { sesInboundForAws } from '@skyclause/delivery'
import type { WorkerPart } from './server'

/** `POST /ses/inbound` (D7): 503 until infra/aws's values are on the worker (gate 4B). */
export function createSesInboundPart(load: () => Env<'worker'> = () => loadEnv('worker')): WorkerPart {
  let handle: ((request: Request) => Promise<Response>) | undefined
  return {
    owner: 'a-email-transport',
    ses: {
      '/inbound': async (request) => {
        if (!handle) {
          const env = load()
          if (!env.SES_REGION || !env.AWS_ROLE_ARN || !env.INBOUND_SNS_TOPIC_ARN || !env.INBOUND_BUCKET) {
            return new Response('inbound email is not configured', { status: 503 })
          }
          handle = sesInboundForAws({
            region: env.SES_REGION,
            roleArn: env.AWS_ROLE_ARN,
            topicArn: env.INBOUND_SNS_TOPIC_ARN,
            bucket: env.INBOUND_BUCKET
          })
        }
        return handle(request)
      }
    }
  }
}

export const sesInbound = createSesInboundPart()
