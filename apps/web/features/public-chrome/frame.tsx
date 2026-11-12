import { t } from '@skyclause/i18n'
import type { ReactNode } from 'react'
import { buttonVariants } from '#ui/button-variants'
import { hrefOn } from '../../lib/origins'
import type { PublicLocale } from './attribution'
import { BlockWordmark } from './block-wordmark'
import { BrandLines } from './brand-lines'
import './catalogue'
import styles from './public-chrome.module.css'
import { cn } from '#lib/utils'

export { BrandLines } from './brand-lines'

const privacyPath = (locale: PublicLocale) => (locale === 'ms' ? '/ms/legal/privacy' : '/legal/privacy')

export function PublicChrome({
  children,
  locale = 'en',
  includeSafetyLine = true,
  path
}: {
  children: ReactNode
  locale?: PublicLocale
  includeSafetyLine?: boolean
  /** The request's path, so the link to the page being read says so. */
  path?: string
}) {
  // Only pages that exist: the Terms are English only, so a Malay reader's link says so with hrefLang. The frame also
  // draws the app host's not-found page, so each link names the host its page is on.
  const legal = [
    { label: t('legal.frame.terms', {}, locale), page: '/legal/terms', hrefLang: 'en' as const },
    { label: t('legal.frame.privacy', {}, locale), page: privacyPath(locale), hrefLang: locale }
  ]
  const other = locale === 'ms' ? 'en' : 'ms'
  const language = {
    label: t('legal.frame.language', {}, locale),
    title: t('legal.frame.languageLabel', {}, locale),
    href: hrefOn('marketing', privacyPath(other)),
    hrefLang: other
  }
  const current = (page: string) => (page === path ? ('page' as const) : undefined)
  const link = ({ label, page, hrefLang }: { label: string; page: string; hrefLang: string }) => (
    <a
      key={page}
      href={hrefOn('marketing', page)}
      hrefLang={hrefLang}
      aria-current={current(page)}
      className="current-mark"
    >
      {label}
    </a>
  )

  return (
    <div className={styles.frame} data-surface="public">
      <header className={styles.header}>
        <a className={styles.home} href={hrefOn('marketing', '/')} aria-label={t('legal.frame.home', {}, locale)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- The fixed SVG mark needs no optimization or client code. */}
          <img className={styles.mark} src="/icon.svg" width={28} height={28} alt="" />
          <span className={styles.wordmark} translate="no">
            {t('brand.name', {}, locale)}
          </span>
        </a>
        <div className={styles.headerEnd}>
          <nav className={styles.nav} aria-label={t('legal.frame.navigation', {}, locale)}>
            {legal.map(link)}
          </nav>
          <a className={cn(buttonVariants({ size: 'lg' }), styles.action)} href={hrefOn('app', '/sign-in')}>
            {t('legal.frame.signIn', {}, locale)}
          </a>
        </div>
      </header>
      <div id="public-main" className={styles.content} tabIndex={-1}>
        {children}
      </div>
      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <BrandLines locale={locale} includeSafetyLine={includeSafetyLine} />
          <nav className={styles.footerNav} aria-label={t('legal.frame.footerNavigation', {}, locale)}>
            {legal.map(link)}
            <a href={language.href} hrefLang={language.hrefLang} lang={language.hrefLang} title={language.title}>
              {language.label}
            </a>
          </nav>
        </div>
        <div className={styles.wordmarkBand}>
          <BlockWordmark locale={locale} />
        </div>
      </footer>
    </div>
  )
}
