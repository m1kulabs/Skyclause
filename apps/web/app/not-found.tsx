import Link from 'next/link'
import { t } from '@skyclause/i18n'

export default function NotFound() {
  return (
    <main className="token-page">
      <h1 className="type-title">{t('shell.not_found')}</h1>
      <p>{t('shell.not_found_help')}</p>
      <Link className="inline-flex min-h-8.5 items-center" href="/">
        {t('shell.go_home')}
      </Link>
    </main>
  )
}
