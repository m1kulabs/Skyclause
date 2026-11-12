import type { ReactNode } from 'react'
import type { Source, SourceKind } from '@skyclause/contracts'
import { attribution as sourceAttribution } from '@skyclause/elements'
import { t } from '@skyclause/i18n'
import './catalogue'
import { AttributionLink } from './attribution-link'
import styles from './public-chrome.module.css'

export type PublicLocale = 'en' | 'ms'

function details(source: Source, locale: PublicLocale) {
  const rules = sourceAttribution[source.kind as SourceKind]

  return (
    <dl className={styles.sourceDetails} data-licence-id={source.licence_id}>
      <dt>{t('legal.attribution.station', {}, locale)}</dt>
      <dd translate="no">{source.external_id}</dd>
      <dt>{t('legal.attribution.licence', {}, locale)}</dt>
      <dd>
        {rules.derived_only ? (
          <>
            {t('legal.attribution.derived', {}, locale)}
            <span className={styles.derivedLicence} translate="no">
              {source.licence_label}
            </span>
          </>
        ) : rules.licence_url ? (
          <a href={rules.licence_url} translate="no">
            {source.licence_label}
          </a>
        ) : (
          <span translate="no">{source.licence_label}</span>
        )}
        {source.kind === 'wikipedia' && <p>{t('legal.attribution.shareAlike', {}, locale)}</p>}
      </dd>
      <dt>{t('legal.attribution.sourceUrl', {}, locale)}</dt>
      <dd>
        <a href={source.url} translate="no">
          {source.url}
        </a>
      </dd>
    </dl>
  )
}

export function Attribution({
  source,
  children,
  locale = 'en'
}: {
  source: Source
  children: ReactNode
  locale?: PublicLocale
}) {
  const sourceDetails = details(source, locale)

  return (
    <AttributionLink
      dialogTitle={t('legal.attribution.dialogTitle', {}, locale)}
      sourceName={source.name}
      closeLabel={t('legal.attribution.close', {}, locale)}
      linkLabel={t('legal.attribution.view', { source: source.name, station: source.external_id }, locale)}
      details={sourceDetails}
    >
      {children}
    </AttributionLink>
  )
}

export function AttributionList({ sources, locale = 'en' }: { sources: Source[]; locale?: PublicLocale }) {
  return (
    <section id="attribution" className={styles.attributionList} aria-labelledby="attribution-list-title">
      <h2 id="attribution-list-title">{t('legal.attribution.heading', {}, locale)}</h2>
      <ul>
        {sources.map((source) => (
          <li key={source.id}>
            <h3 translate="no">{source.name}</h3>
            {details(source, locale)}
          </li>
        ))}
      </ul>
    </section>
  )
}
