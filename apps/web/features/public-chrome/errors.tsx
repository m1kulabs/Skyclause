import { t } from '@skyclause/i18n'
import { buttonVariants } from '#ui/button'
import './catalogue'
import type { PublicLocale } from './attribution'
import styles from './public-chrome.module.css'

export function NotFoundContent({ locale = 'en' }: { locale?: PublicLocale }) {
  return (
    <main className={styles.errorPage} data-status-code="404">
      <h1 className="type-head">{t('legal.notFound.label', {}, locale)}</h1>
      <p className={`type-page-body ${styles.errorSentence}`}>{t('legal.notFound.sentence', {}, locale)}</p>
      <div className={styles.exits}>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Error exits must work without JavaScript. */}
        <a className={buttonVariants({ size: 'lg' })} href="/">
          {t('legal.notFound.home', {}, locale)}
        </a>
      </div>
    </main>
  )
}

export function PublicErrorContent({ locale = 'en', reset }: { locale?: PublicLocale; reset?: () => void }) {
  return (
    <main className={styles.errorPage}>
      <h1 className="type-head">{t('legal.error.label', {}, locale)}</h1>
      <p className={`type-page-body ${styles.errorSentence}`}>{t('legal.error.sentence', {}, locale)}</p>
      <div className={styles.exits}>
        {reset ? (
          <button className={buttonVariants({ size: 'lg' })} type="button" onClick={reset}>
            {t('legal.error.retry', {}, locale)}
          </button>
        ) : null}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Error exits must work without JavaScript. */}
        <a className={buttonVariants({ size: 'lg', variant: reset ? 'outline' : 'default' })} href="/">
          {t('legal.error.home', {}, locale)}
        </a>
      </div>
    </main>
  )
}
