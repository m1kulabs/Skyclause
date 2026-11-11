import { loadEnv, type Env } from '@skyclause/config'
import { ensureVapidKeys, resendInboundHandler } from '@skyclause/delivery'
import type { ResendHandler, WorkerPart } from './server'

/**
 * a-email-transport's part: inbound mail, Resend's `email.received` on `POST /resend/webhook` (#657), read from Resend
 * with `RESEND_RECEIVING_API_KEY` and answering 503 until the receiving settings are on the worker, and the
 * `vapid-keys` job.
 */
export function createEmailPart(
  load: () => Env<'worker'> = () => loadEnv('worker'),
  o: { fetch?: typeof fetch } = {}
): WorkerPart {
  let handle: ResendHandler | undefined
  return {
    owner: 'a-email-transport',
    resend: {
      'email.received': async (event) => {
        if (!handle) {
          const apiKey = load().RESEND_RECEIVING_API_KEY
          if (!apiKey) return new Response('inbound email is not configured', { status: 503 })
          handle = resendInboundHandler({ apiKey, fetch: o.fetch })
        }
        return handle(event)
      }
    },
    jobs: {
      'vapid-keys': async () => {
        const project = loadEnv('job').GCP_PROJECT
        if (!project) throw new Error('GCP_PROJECT is not set')
        await ensureVapidKeys({ project })
      }
    }
  }
}

export const email = createEmailPart()
