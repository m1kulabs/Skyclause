import { t } from '@skyclause/i18n'
import '@skyclause/i18n/brand'
import styles from './public-chrome.module.css'

export function BrandLines({
  locale = 'en',
  includeSafetyLine = true
}: {
  locale?: 'en' | 'ms'
  includeSafetyLine?: boolean
}) {
  return (
    <div className={styles.disclosures}>
      <p>{t('brand.non_affiliation', {}, locale)}</p>
      {includeSafetyLine && <p>{t('brand.not_safety_service', {}, locale)}</p>}
    </div>
  )
}
