import { t } from './catalogue'

export function TokenFooter({ token, locale }: { token: string; locale: 'en' | 'ms' }) {
  return (
    <footer className="grid gap-4">
      <a
        className="underline"
        href={`/subscribe/${encodeURIComponent(token)}/data${locale === 'ms' ? '?lang=ms' : ''}`}
      >
        {t('subscribe.data', {}, locale)}
      </a>
      <p>{t('subscribe.safety', {}, locale)}</p>
    </footer>
  )
}
