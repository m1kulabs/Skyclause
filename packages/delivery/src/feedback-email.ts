import { formatDate } from '@skyclause/i18n/format'
import { t } from '@skyclause/i18n/replies'

// #163 (c-recipient-replies): the plan-feedback email after a graded Sky window (ANL-7), in the notice language. The
// worker's `plan-feedback` consumer writes the `notice` row first and sends through `EmailTransport`.

export function renderFeedbackEmail(o: {
  language: 'en' | 'ms'
  projectName: string
  windowTitle: string
  windowStartsAt: Date | string
  url: string
  unsubscribeUrl: string
}): { subject: string; text: string } {
  const vars = {
    project: o.projectName,
    window: o.windowTitle,
    date: formatDate(o.windowStartsAt, o.language),
    url: o.url,
    unsubscribe: o.unsubscribeUrl
  }
  return {
    subject: t('replies.feedback.subject', vars, o.language),
    text: `${t('replies.feedback.body', vars, o.language)}\n\n${t('brand.not_safety_service', {}, o.language)}`
  }
}
