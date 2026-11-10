import type { CallView } from '@skyclause/contracts'
import type { EmailMessage } from './email'
import { renderNotice, type NoticeContext } from './notices'

// #158 c-sender-email: a `call` notice as the email handed to SES, with this recipient's links (D25: each opens a
// page whose one button posts), RFC 8058 one-click unsubscribe, and for a Crowd notice a reply address (D7, CAL-17).

export interface CallNoticeOptions extends NoticeContext {
  to: string
  /** The notice's language, the one actually sent after any LOC-5 fallback. */
  language: string
  /** The `notice` row's `idempotency_key`. */
  idempotencyKey: string
  /** Raw subscriber tokens minted for this notice: `manage`, `unsubscribe` and, for a Crowd notice, `reply`. */
  tokens: { manage: string; unsubscribe: string; reply?: string }
  /** `APP_ORIGIN` (the subscriber pages and routes) and `MARKETING_ORIGIN` (the permalink, D33). */
  origins: { app: string; marketing: string }
  /** `INBOUND_DOMAIN`, needed with a `reply` token. */
  inboundDomain?: string
}

export function callNoticeEmail(call: CallView, o: CallNoticeOptions): EmailMessage {
  const { tokens, origins } = o
  if (tokens.reply && !o.inboundDomain) throw new Error('a Crowd notice needs INBOUND_DOMAIN for its Reply-To')
  const page = (path: string) => `${origins.app}/subscribe/${path}`
  const { subject, text, html } = renderNotice(call, {
    language: o.language,
    channel: 'email',
    links: {
      permalink: `${origins.marketing}/c/${call.id}`,
      preferences: page(tokens.manage),
      unsubscribe: page(`${tokens.unsubscribe}/unsubscribe`),
      ...(tokens.reply ? { reply: page(`${tokens.reply}/reply`) } : {})
    },
    project: o.project,
    window: o.window,
    approver: o.approver,
    sources: o.sources,
    wording: o.wording
  })
  return {
    to: o.to,
    from: 'notices',
    subject,
    text,
    html,
    ...(tokens.reply ? { replyTo: `r+${tokens.reply}@${o.inboundDomain}` } : {}),
    headers: {
      'List-Unsubscribe': `<${origins.app}/api/subscribe/${tokens.unsubscribe}/unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    },
    category: 'call',
    idempotencyKey: o.idempotencyKey
  }
}
