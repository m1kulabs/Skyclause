import { t } from '@skyclause/i18n'
import type { ReactNode } from 'react'
import { buttonVariants } from '#ui/button-variants'
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
  // Only pages that exist: the Terms are English only, so a Malay reader's link says so with hrefLang.
  const legal = [
    { label: t('legal.frame.terms', {}, locale), href: '/legal/terms', hrefLang: 'en' as const },
    { label: t('legal.frame.privacy', {}, locale), href: privacyPath(locale), hrefLang: locale }
  ]
  const other = locale === 'ms' ? 'en' : 'ms'
  const language = {
    label: t('legal.frame.language', {}, locale),
    title: t('legal.frame.languageLabel', {}, locale),
    href: privacyPath(other),
    hrefLang: other
  }
  const current = (href: string) => (href === path ? ('page' as const) : undefined)
  const link = ({ label, href, hrefLang }: { label: string; href: string; hrefLang: string }) => (
    <a key={href} href={href} hrefLang={hrefLang} aria-current={current(href)} className="current-mark">
      {label}
    </a>
  )

  return (
    <div className={styles.frame} data-surface="public">
      <header className={styles.header}>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Public navigation stays server-rendered and works without JavaScript. */}
        <a className={styles.home} href="/" aria-label={t('legal.frame.home', {}, locale)}>
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
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Public navigation stays server-rendered and works without JavaScript. */}
          <a className={cn(buttonVariants({ size: 'lg' }), styles.action)} href="/sign-in">
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
