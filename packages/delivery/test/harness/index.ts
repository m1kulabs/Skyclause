import type { EmailTransport } from '@skyclause/contracts'

type Email = Parameters<EmailTransport['send']>[0]

/** The §7 mailbox double, which keeps each message sent through EmailTransport. */
export function createMailbox(): EmailTransport & { sent: Email[] } {
  const sent: Email[] = []
  return {
    sent,
    async send(message) {
      sent.push(message)
      return { providerMessageId: `mailbox-${sent.length}` }
    }
  }
}
