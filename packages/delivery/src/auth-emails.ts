import { t } from '@skyclause/i18n'
import { formatDateTime } from '@skyclause/i18n/format'

/** English auth email copy, sourced from packages/i18n and formatted in MYT. */
export function magicLinkEmail(url: string, expiresAt: Date) {
  return {
    subject: t('auth.magic_link.subject'),
    text: t('auth.magic_link.body', { url, expiresAt: formatDateTime(expiresAt, 'en') })
  }
}

export function magicLinkDisabledEmail() {
  return {
    subject: t('auth.magic_link_disabled.subject'),
    text: t('auth.magic_link_disabled.body')
  }
}

export function googleLinkEmail(url: string, expiresAt: Date) {
  return {
    subject: t('auth.link_google.subject'),
    text: t('auth.link_google.body', { url, expiresAt: formatDateTime(expiresAt, 'en') })
  }
}
