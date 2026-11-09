import { t } from '@skyclause/i18n'
import './catalogue'
import type { PublicLocale } from './attribution'
import styles from './public-chrome.module.css'

export function NotFoundContent({ locale = 'en' }: { locale?: PublicLocale }) {
  return (
    <main className={styles.errorPage} data-status-code="404">
      <h1 className={styles.errorLabel}>{t('legal.notFound.label', {}, locale)}</h1>
      <p className={styles.errorSentence}>{t('legal.notFound.sentence', {}, locale)}</p>
      <nav className={styles.exits} aria-label={t('legal.frame.navigation', {}, locale)}>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Error exits must work without JavaScript. */}
        <a href="/">{t('legal.notFound.home', {}, locale)}</a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Error exits must work without JavaScript. */}
        <a href="/status">{t('legal.notFound.status', {}, locale)}</a>
        <a href={locale === 'ms' ? '/ms/legal/privacy' : '/legal/privacy'}>{t('legal.notFound.privacy', {}, locale)}</a>
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
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Error exits must work without JavaScript. */}
        <a href="/">{t('legal.error.home', {}, locale)}</a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Error exits must work without JavaScript. */}
        <a href="/status">{t('legal.error.status', {}, locale)}</a>
        <a href={locale === 'ms' ? '/ms/legal/privacy' : '/legal/privacy'}>{t('legal.error.privacy', {}, locale)}</a>
      </nav>
    </main>
  )
}
