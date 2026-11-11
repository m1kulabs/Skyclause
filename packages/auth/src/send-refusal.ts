import { log } from '@skyclause/config'
import type { EmailTransport } from '@skyclause/contracts'
import { EmailSendError } from '@skyclause/delivery'
import { APIError } from 'better-auth/api'

/**
 * `send`, with a send the provider refuses logged as one structured ERROR line and answered 502. Thrown as is, Better
 * Auth logs the error's stack over many lines with no severity and answers 500, or lets it escape the handler (#623).
 */
export function withSendRefusal(send: EmailTransport['send']): EmailTransport['send'] {
  return async (message) => {
    try {
      return await send(message)
    } catch (error) {
      if (!(error instanceof EmailSendError)) throw error
      log.error(error.message, {
        category: message.category,
        code: error.code,
        status: error.status,
        detail: error.cause instanceof Error ? error.cause.message : undefined
      })
      throw new APIError('BAD_GATEWAY', { code: 'EMAIL_NOT_SENT', message: 'The email could not be sent.' })
    }
  }
}
