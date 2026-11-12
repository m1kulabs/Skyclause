import { t } from './catalogue'

export function TokenFooter({ token, locale }: { token: string; locale: 'en' | 'ms' }) {
  return (
    <footer className="auth-stack">
      <a
        className="auth-link"
        href={`/subscribe/${encodeURIComponent(token)}/data${locale === 'ms' ? '?lang=ms' : ''}`}
      >
        {t('subscribe.data', {}, locale)}
      </a>
      <p className="auth-hint m-0">{t('subscribe.safety', {}, locale)}</p>
    </footer>
  )
}
