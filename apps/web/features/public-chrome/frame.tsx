import Link from 'next/link'
import Image from 'next/image'
import { t } from '@skyclause/i18n'
import type { ReactNode } from 'react'
import type { PublicLocale } from './attribution'
import './catalogue'
import styles from './public-chrome.module.css'

export function BrandLines({ locale = 'en' }: { locale?: PublicLocale }) {
  return (
    <div className={styles.disclosures}>
      <p>{t('brand.non_affiliation', {}, locale)}</p>
      <p>{t('brand.not_safety_service', {}, locale)}</p>
    </div>
  )
}

export function PublicChrome({ children, locale = 'en' }: { children: ReactNode; locale?: PublicLocale }) {
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
        <Link className={styles.home} href="/" aria-label={t('legal.frame.home', {}, locale)}>
          <Image className={styles.mark} src="/icon.svg" width={24} height={24} alt="" />
          <span className={styles.wordmark} translate="no">
            {t('brand.name', {}, locale)}
          </span>
        </Link>
      </header>
      <div id="public-main" className={styles.content} tabIndex={-1}>
        {children}
      </div>
      <footer className={styles.footer}>
        <BrandLines locale={locale} />
        <nav className={styles.footerNav} aria-label={t('legal.frame.navigation', {}, locale)}>
          {links.map(({ label, href }) => (
            <span className={styles.footerLink} key={href}>
              <Link href={href}>{label}</Link>
            </span>
          ))}
        </nav>
      </footer>
    </div>
  )
}
