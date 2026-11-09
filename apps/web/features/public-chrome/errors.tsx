import Link from 'next/link'
import { t } from '@skyclause/i18n'
import './catalogue'
import type { PublicLocale } from './attribution'
import styles from './public-chrome.module.css'

export function NotFoundContent({ locale = 'en' }: { locale?: PublicLocale }) {
  return (
    <main className={styles.errorPage}>
      <h1 className={styles.errorLabel}>{t('legal.notFound.label', {}, locale)}</h1>
      <p className={styles.errorSentence}>{t('legal.notFound.sentence', {}, locale)}</p>
      <nav className={styles.exits} aria-label={t('legal.frame.navigation', {}, locale)}>
        <Link href="/">{t('legal.notFound.home', {}, locale)}</Link>
        <Link href="/status">{t('legal.notFound.status', {}, locale)}</Link>
        <Link href={locale === 'ms' ? '/ms/legal/privacy' : '/legal/privacy'}>
          {t('legal.notFound.privacy', {}, locale)}
        </Link>
      </nav>
    </main>
  )
}

export function PublicErrorContent({ locale = 'en' }: { locale?: PublicLocale }) {
  return (
    <main className={styles.errorPage}>
      <h1 className={styles.errorLabel}>{t('legal.error.label', {}, locale)}</h1>
      <p className={styles.errorSentence}>{t('legal.error.sentence', {}, locale)}</p>
      <nav className={styles.exits} aria-label={t('legal.frame.navigation', {}, locale)}>
        <Link href="/">{t('legal.error.home', {}, locale)}</Link>
        <Link href="/status">{t('legal.error.status', {}, locale)}</Link>
        <Link href={locale === 'ms' ? '/ms/legal/privacy' : '/legal/privacy'}>
          {t('legal.error.privacy', {}, locale)}
        </Link>
      </nav>
    </main>
  )
}
