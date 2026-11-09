import { t } from '@skyclause/i18n/subscriber-emails'

// #157 (c-subscribers): the two emails a subscriber gets before any notice, in their notice language. The sender
// (packages/api's subscriber services) writes the `notice` row first and sends through `EmailTransport`.

export type SubscriberEmailKind = 'confirmation' | 'preference_link'

export function renderSubscriberEmail(
  kind: SubscriberEmailKind,
  o: { language: 'en' | 'ms'; projectName: string; url: string }
): { subject: string; text: string } {
  const vars = { project: o.projectName, url: o.url }
  return {
    subject: t(`subscriber-emails.${kind}.subject`, vars, o.language),
    text: `${t(`subscriber-emails.${kind}.body`, vars, o.language)}\n\n${t('brand.not_safety_service', {}, o.language)}`
  }
}
