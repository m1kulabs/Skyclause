import { PRIVACY_NOTICE_VERSION, TERMS_VERSION } from '@skyclause/contracts'
import { t } from '@skyclause/i18n'
import type { PublicLocale } from '../public-chrome'
import '../public-chrome/catalogue'
import styles from './legal.module.css'

const retentionRows = [
  ['legal.privacy.retention.readingsLabel', 'legal.privacy.retention.readingsPeriod'],
  ['legal.privacy.retention.cameraLabel', 'legal.privacy.retention.cameraPeriod'],
  ['legal.privacy.retention.busLabel', 'legal.privacy.retention.busPeriod'],
  ['legal.privacy.retention.guestWindowsLabel', 'legal.privacy.retention.guestWindowsPeriod'],
  ['legal.privacy.retention.guestAccountsLabel', 'legal.privacy.retention.guestAccountsPeriod'],
  ['legal.privacy.retention.subscribersLabel', 'legal.privacy.retention.subscribersPeriod'],
  ['legal.privacy.retention.ledgerLabel', 'legal.privacy.retention.ledgerPeriod'],
  ['legal.privacy.retention.organisationsLabel', 'legal.privacy.retention.organisationsPeriod'],
  ['legal.privacy.retention.exportsLabel', 'legal.privacy.retention.exportsPeriod'],
  ['legal.privacy.retention.timetableLabel', 'legal.privacy.retention.timetablePeriod'],
  ['legal.privacy.retention.backupsLabel', 'legal.privacy.retention.backupsPeriod']
] as const

function RetentionTable({ locale }: { locale: PublicLocale }) {
  return (
    <dl className={styles.retention}>
      {retentionRows.map(([label, period]) => (
        <div key={label}>
          <dt>{t(label, {}, locale)}</dt>
          <dd>{t(period, {}, locale)}</dd>
        </div>
      ))}
    </dl>
  )
}

function publishedNoticeVersion(): string {
  if (PRIVACY_NOTICE_VERSION === null) throw new Error('The privacy notice has not been published')
  return PRIVACY_NOTICE_VERSION
}

export function PrivacyNoticePage({ locale }: { locale: PublicLocale }) {
  const version = publishedNoticeVersion()

  return (
    <main className={styles.page} lang={locale}>
      <header>
        <p className={styles.label}>{t('legal.privacy.label', {}, locale)}</p>
        <h1>{t('legal.privacy.title', {}, locale)}</h1>
        <p className={styles.intro}>{t('legal.privacy.intro', {}, locale)}</p>
        <p className={styles.version}>
          {t('legal.privacy.version', {}, locale)} <time dateTime={version}>{version}</time>
        </p>
      </header>

      <section className={styles.section}>
        <h2>{t('legal.privacy.collectionHeading', {}, locale)}</h2>
        <p>{t('legal.privacy.subscriberData', {}, locale)}</p>
        <p>{t('legal.privacy.guestData', {}, locale)}</p>
      </section>

      <section className={styles.section}>
        <h2>{t('legal.privacy.processorsHeading', {}, locale)}</h2>
        <p>{t('legal.privacy.processors', {}, locale)}</p>
        <p>{t('legal.privacy.purpose', {}, locale)}</p>
      </section>

      <section className={styles.section}>
        <h2>{t('legal.privacy.regionHeading', {}, locale)}</h2>
        <p>{t('legal.privacy.region', {}, locale)}</p>
        <p>{t('legal.privacy.emailTransfer', {}, locale)}</p>
        <p>{t('legal.privacy.crossBorder', {}, locale)}</p>
      </section>

      <section className={styles.section}>
        <h2>{t('legal.privacy.rightsHeading', {}, locale)}</h2>
        <p>{t('legal.privacy.rights', {}, locale)}</p>
      </section>

      <section className={styles.section}>
        <h2>{t('legal.privacy.retentionHeading', {}, locale)}</h2>
        <p>{t('legal.privacy.retentionIntro', {}, locale)}</p>
        <RetentionTable locale={locale} />
      </section>

      <section className={styles.section}>
        <h2>{t('legal.privacy.breachHeading', {}, locale)}</h2>
        <p>{t('legal.privacy.breach', {}, locale)}</p>
      </section>
    </main>
  )
}

const planKeys = [
  ['commons', 'commonsPrice', 'commonsDetails'],
  ['community', 'communityPrice', 'communityDetails'],
  ['team', 'teamPrice', 'teamDetails'],
  ['campus', 'campusPrice', 'campusDetails']
] as const

const cadenceKeys = [
  'jpsCadence',
  'metWarningsCadence',
  'metForecastCadence',
  'apimsCadence',
  'rapidRailCadence',
  'gtfsRtCadence',
  'gtfsStaticCadence',
  'listingsCadence',
  'cameraCadence',
  'piCadence'
] as const

export function TermsPage({ locale = 'en' }: { locale?: PublicLocale }) {
  return (
    <main className={styles.page} lang={locale}>
      <header>
        <p className={styles.label}>{t('legal.terms.label', {}, locale)}</p>
        <h1>{t('legal.terms.title', {}, locale)}</h1>
        <p className={styles.intro}>{t('legal.terms.intro', {}, locale)}</p>
        <p className={styles.version}>
          {t('legal.terms.version', {}, locale)} <time dateTime={TERMS_VERSION}>{TERMS_VERSION}</time>
        </p>
      </header>

      <section className={`${styles.section} ${styles.anchor}`} id="plans">
        <h2>{t('legal.terms.plansHeading', {}, locale)}</h2>
        <ul className={styles.plans}>
          {planKeys.map(([name, price, details]) => (
            <li className={styles.plan} key={name}>
              <h3>{t(`legal.terms.${name}`, {}, locale)}</h3>
              <p className={styles.price}>
                <strong>{t(`legal.terms.${price}`, {}, locale)}</strong>
                <span>{t('legal.terms.proposal', {}, locale)}</span>
              </p>
              <p className={styles.planDetails}>{t(`legal.terms.${details}`, {}, locale)}</p>
            </li>
          ))}
        </ul>
        <p>{t('legal.terms.betaNote', {}, locale)}</p>
      </section>

      <section className={`${styles.section} ${styles.anchor}`} id="service">
        <h2>{t('legal.terms.serviceHeading', {}, locale)}</h2>
        <section>
          <h3>{t('legal.terms.sourceHeading', {}, locale)}</h3>
          <ul className={styles.cadences}>
            {cadenceKeys.map((key) => (
              <li key={key}>{t(`legal.terms.${key}`, {}, locale)}</li>
            ))}
          </ul>
          <p>{t('legal.terms.pollTarget', {}, locale)}</p>
        </section>
        <section className={styles.section}>
          <h3>{t('legal.terms.gradingHeading', {}, locale)}</h3>
          <p>{t('legal.terms.skyGrades', {}, locale)}</p>
          <p>{t('legal.terms.crowdGrades', {}, locale)}</p>
          <p>{t('legal.terms.latencyTargets', {}, locale)}</p>
          <p>{t('legal.terms.availabilityTargets', {}, locale)}</p>
        </section>
        <section className={styles.section}>
          <h3>{t('legal.terms.guestHeading', {}, locale)}</h3>
          <p>{t('legal.terms.guestWindows', {}, locale)}</p>
          <p>{t('legal.terms.guestBudgets', {}, locale)}</p>
          <p>{t('legal.terms.guestAccounts', {}, locale)}</p>
        </section>
        <section className={styles.section}>
          <h3>{t('legal.terms.retentionHeading', {}, locale)}</h3>
          <RetentionTable locale={locale} />
        </section>
        <p className={styles.serviceSafety}>{t('legal.terms.safety', {}, locale)}</p>
      </section>
    </main>
  )
}
