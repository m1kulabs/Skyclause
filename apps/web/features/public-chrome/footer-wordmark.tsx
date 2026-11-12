import { t } from '@skyclause/i18n'
import type { PublicLocale } from './attribution'
import styles from './public-chrome.module.css'

/** The name returns at the foot as capsules of different lengths, one per letter; the label keeps it one word. */
export function FooterWordmark({ locale = 'en' }: { locale?: PublicLocale }) {
  const name = t('brand.name', {}, locale)
  return (
    <div className={styles.footerWordmark} role="img" aria-label={name} translate="no">
      {Array.from(name).map((letter, index) => (
        <span key={index} aria-hidden="true">
          {letter}
        </span>
      ))}
    </div>
  )
}
