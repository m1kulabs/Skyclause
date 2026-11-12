import { PRIVACY_NOTICE_VERSION, TERMS_VERSION } from '@skyclause/contracts'
import { t } from '@skyclause/i18n'
import type { ReactNode } from 'react'
import type { PublicLocale } from '../public-chrome'
import '../public-chrome/catalogue'
import styles from './legal.module.css'

const retentionRows = [
  'readings',
  'camera',
  'bus',
  'guestWindows',
  'guestAccounts',
  'subscribers',
  'ledger',
  'organisations',
  'exports',
  'timetable',
  'backups'
] as const

function RetentionTable({ locale, labelledBy }: { locale: PublicLocale; labelledBy: string }) {
  const column = (name: 'columnData' | 'columnKept' | 'columnAfter') => t(`legal.privacy.retention.${name}`, {}, locale)
  return (
    <table className={styles.retention} aria-labelledby={labelledBy}>
      <thead>
        <tr>
          <th scope="col">{column('columnData')}</th>
          <th scope="col">{column('columnKept')}</th>
          <th scope="col">{column('columnAfter')}</th>
        </tr>
      </thead>
      <tbody>
        {retentionRows.map((row) => (
          <tr key={row}>
            <th scope="row">{t(`legal.privacy.retention.${row}Label`, {}, locale)}</th>
            <td data-label={column('columnKept')}>{t(`legal.privacy.retention.${row}Kept`, {}, locale)}</td>
            <td data-label={column('columnAfter')}>{t(`legal.privacy.retention.${row}After`, {}, locale)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

interface ContentsItem {
  id: string
  label: string
  children?: ContentsItem[]
}

function Contents({ items, locale }: { items: ContentsItem[]; locale: PublicLocale }) {
  const list = (entries: ContentsItem[]) => (
    <ol>
      {entries.map(({ id, label, children }) => (
        <li key={id}>
          <a href={`#${id}`}>{label}</a>
          {children ? list(children) : null}
        </li>
      ))}
    </ol>
  )
  return (
    <nav className={styles.contents} aria-labelledby="legal-contents">
      <p id="legal-contents">{t('legal.contents', {}, locale)}</p>
      {list(items)}
    </nav>
  )
}

/** A page to read: title, a plain lead, the version, a contents list and one comfortable column. */
function LegalPage({
  locale,
  title,
  intro,
  version,
  contents,
  children
}: {
  locale: PublicLocale
  title: string
  intro: string
  version: ReactNode
  contents: ContentsItem[]
  children: ReactNode
}) {
  return (
    <main className={styles.page} lang={locale}>
      <header className={styles.head}>
        <h1 className="type-head">{title}</h1>
        <p className={`type-lead ${styles.intro}`}>{intro}</p>
        <p className={styles.version}>{version}</p>
      </header>
      <div className={styles.body}>
        <Contents items={contents} locale={locale} />
        <div className={styles.article}>{children}</div>
      </div>
    </main>
  )
}

function publishedNoticeVersion(): string {
  if (PRIVACY_NOTICE_VERSION === null) throw new Error('The privacy notice has not been published')
  return PRIVACY_NOTICE_VERSION
}

export function PrivacyNoticePage({ locale }: { locale: PublicLocale }) {
  const version = publishedNoticeVersion()
  const heading = (key: string) => t(`legal.privacy.${key}`, {}, locale)
  const sections = [
    { id: 'collection', heading: 'collectionHeading' },
    { id: 'processors', heading: 'processorsHeading' },
    { id: 'region', heading: 'regionHeading' },
    { id: 'rights', heading: 'rightsHeading' },
    { id: 'retention', heading: 'retentionHeading' },
    { id: 'breach', heading: 'breachHeading' }
  ] as const

  return (
    <LegalPage
      locale={locale}
      title={heading('title')}
      intro={heading('intro')}
      version={
        <>
          {heading('version')} <time dateTime={version}>{version}</time>
        </>
      }
      contents={sections.map(({ id, heading: key }) => ({ id, label: heading(key) }))}
    >
      <section className={styles.section} id="collection" aria-labelledby="collection-heading">
        <h2 id="collection-heading">{heading('collectionHeading')}</h2>
        <p>{heading('subscriberData')}</p>
        <p>{heading('guestData')}</p>
      </section>

      <section className={styles.section} id="processors" aria-labelledby="processors-heading">
        <h2 id="processors-heading">{heading('processorsHeading')}</h2>
        <p>{heading('processors')}</p>
        <p>{heading('purpose')}</p>
      </section>

      <section className={styles.section} id="region" aria-labelledby="region-heading">
        <h2 id="region-heading">{heading('regionHeading')}</h2>
        <p>{heading('region')}</p>
        <p>{heading('emailTransfer')}</p>
        <p>{heading('crossBorder')}</p>
      </section>

      <section className={styles.section} id="rights" aria-labelledby="rights-heading">
        <h2 id="rights-heading">{heading('rightsHeading')}</h2>
        <p>{heading('rights')}</p>
      </section>

      <section className={styles.section} id="retention" aria-labelledby="retention-heading">
        <h2 id="retention-heading">{heading('retentionHeading')}</h2>
        <p>{heading('retentionIntro')}</p>
        <RetentionTable locale={locale} labelledBy="retention-heading" />
      </section>

      <section className={styles.section} id="breach" aria-labelledby="breach-heading">
        <h2 id="breach-heading">{heading('breachHeading')}</h2>
        <p>{heading('breach')}</p>
      </section>
    </LegalPage>
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
  const heading = (key: string) => t(`legal.terms.${key}`, {}, locale)

  return (
    <LegalPage
      locale={locale}
      title={heading('title')}
      intro={heading('intro')}
      version={
        <>
          {heading('version')} <time dateTime={TERMS_VERSION}>{TERMS_VERSION}</time>
        </>
      }
      contents={[
        { id: 'plans', label: heading('plansHeading') },
        {
          id: 'service',
          label: heading('serviceHeading'),
          children: [
            { id: 'sources', label: heading('sourceHeading') },
            { id: 'grading', label: heading('gradingHeading') },
            { id: 'guest', label: heading('guestHeading') },
            { id: 'retention', label: heading('retentionHeading') }
          ]
        }
      ]}
    >
      <section className={styles.section} id="plans" aria-labelledby="plans-heading">
        <h2 id="plans-heading">{heading('plansHeading')}</h2>
        <ul className={styles.plans}>
          {planKeys.map(([name, price, details]) => (
            <li className={styles.plan} key={name}>
              <h3>{heading(name)}</h3>
              <p className={styles.price}>
                <strong>{heading(price)}</strong>
                <span>{heading('proposal')}</span>
              </p>
              <p>{heading(details)}</p>
            </li>
          ))}
        </ul>
        <p>{heading('betaNote')}</p>
      </section>

      <section className={styles.section} id="service" aria-labelledby="service-heading">
        <h2 id="service-heading">{heading('serviceHeading')}</h2>
        <section className={styles.subsection} id="sources" aria-labelledby="sources-heading">
          <h3 id="sources-heading">{heading('sourceHeading')}</h3>
          <ul className={styles.cadences}>
            {cadenceKeys.map((key) => (
              <li key={key}>{heading(key)}</li>
            ))}
          </ul>
          <p>{heading('pollTarget')}</p>
        </section>
        <section className={styles.subsection} id="grading" aria-labelledby="grading-heading">
          <h3 id="grading-heading">{heading('gradingHeading')}</h3>
          <p>{heading('skyGrades')}</p>
          <p>{heading('crowdGrades')}</p>
          <p>{heading('latencyTargets')}</p>
          <p>{heading('availabilityTargets')}</p>
        </section>
        <section className={styles.subsection} id="guest" aria-labelledby="guest-heading">
          <h3 id="guest-heading">{heading('guestHeading')}</h3>
          <p>{heading('guestWindows')}</p>
          <p>{heading('guestBudgets')}</p>
          <p>{heading('guestAccounts')}</p>
        </section>
        <section className={styles.subsection} id="retention" aria-labelledby="terms-retention-heading">
          <h3 id="terms-retention-heading">{heading('retentionHeading')}</h3>
          <RetentionTable locale={locale} labelledBy="terms-retention-heading" />
        </section>
        <p className={styles.serviceSafety}>{heading('safety')}</p>
      </section>
    </LegalPage>
  )
}
