import { t } from '@skyclause/i18n'
import type { ReactNode } from 'react'
import type { PublicLocale } from './attribution'
import { BrandLines } from './brand-lines'
import './catalogue'
import styles from './public-chrome.module.css'

export { BrandLines } from './brand-lines'

export function PublicChrome({
  children,
  locale = 'en',
  includeSafetyLine = true
}: {
  children: ReactNode
  locale?: PublicLocale
  includeSafetyLine?: boolean
}) {
  const links = [
    { label: t('legal.frame.docs', {}, locale), href: 'https://docs.skyclause.m1ku.tech' },
    { label: t('legal.frame.status', {}, locale), href: '/status' },
    { label: t('legal.frame.terms', {}, locale), href: '/legal/terms' },
    { label: t('legal.frame.privacy', {}, locale), href: '/legal/privacy' },
    { label: t('legal.frame.malay', {}, locale), href: '/ms/legal/privacy' }
  ]

  return (
    <div className={styles.frame} data-surface="public">
      <header className={styles.header}>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Public navigation stays server-rendered and works without JavaScript. */}
        <a className={styles.home} href="/" aria-label={t('legal.frame.home', {}, locale)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- The fixed SVG mark needs no optimization or client code. */}
          <img className={styles.mark} src="/icon.svg" width={24} height={24} alt="" />
          <span className={styles.wordmark} translate="no">
            {t('brand.name', {}, locale)}
          </span>
        </a>
      </header>
      <div id="public-main" className={styles.content} tabIndex={-1}>
        {children}
      </div>
      <footer className={styles.footer}>
        <BrandLines locale={locale} includeSafetyLine={includeSafetyLine} />
        <nav className={styles.footerNav} aria-label={t('legal.frame.navigation', {}, locale)}>
          {links.map(({ label, href }) => (
            <span className={styles.footerLink} key={href}>
              <a href={href}>{label}</a>
            </span>
          ))}
        </nav>
      </footer>
    </div>
  )
}
