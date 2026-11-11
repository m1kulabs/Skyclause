/* eslint-disable @next/next/no-html-link-for-pages -- Plain anchor keeps next/link out of the root not-found client bundle. */
import { t } from '@skyclause/i18n'

export default function NotFound() {
  return (
    <main className="token-page">
      <h1 className="type-title">{t('shell.not_found')}</h1>
      <p>{t('shell.not_found_help')}</p>
      <a className="inline-flex min-h-8.5 items-center" href="/">
        {t('shell.go_home')}
      </a>
    </main>
  )
}
