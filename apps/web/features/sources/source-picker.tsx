'use client'

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '#ui/dialog'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Field, FieldLabel } from '#ui/field'
import { distanceKm, filterSources, formatDistanceKm, sortSources, type PickerSource } from '../onboarding/model'
import { t } from '../onboarding/catalogue'
import { formatTime } from '@skyclause/i18n/format'
import { sourcesApi, type CatalogueSourceView } from './operations'
import styles from '../onboarding/onboarding.module.css'

const ADAPTERS = [
  'apims',
  'jps_rain',
  'met_warning',
  'met_forecast',
  'rapidrail_od',
  'gtfs_static',
  'gtfs_rt',
  'golive',
  'wikipedia',
  'camera',
  'pi'
] as const

interface SourcePickerProps {
  open: boolean
  onOpenChange(open: boolean): void
  org: string
  projectId: string
  site: { lat: number | null; lon: number | null }
  boundIds: Set<string>
  onBound(source: CatalogueSourceView): Promise<void> | void
}

function cadence(seconds: number) {
  if (seconds % 86400 === 0)
    return seconds === 86400 ? t('onboarding.day') : t('onboarding.cadence_days', { count: seconds / 86400 })
  if (seconds % 3600 === 0)
    return seconds === 3600 ? t('onboarding.hour') : t('onboarding.cadence_hours', { count: seconds / 3600 })
  if (seconds % 60 === 0)
    return seconds === 60 ? t('onboarding.minute') : t('onboarding.cadence_minutes', { count: seconds / 60 })
  return t('onboarding.cadence_seconds', { count: seconds })
}

function observedAt(value: string) {
  return formatTime(value, 'en')
}

function reading(source: CatalogueSourceView) {
  const value = source.latest_reading?.value ?? source.latest_reading?.value_text
  if (value === null || value === undefined) return t('onboarding.no_reading')
  const metric = source.kind === 'apims' ? 'API' : source.latest_reading?.metric.toUpperCase()
  const age =
    source.age_s === null
      ? null
      : source.age_s < 90 * 60
        ? `${Math.max(1, Math.floor(source.age_s / 60))} min`
        : `${Math.floor(source.age_s / 3600)} h`
  const text = `${metric} ${value}`
  if (!age) return text
  const observed = source.latest_reading?.observed_at
    ? ` · ${t('onboarding.observed_at', { time: observedAt(source.latest_reading.observed_at) })}`
    : ''
  return `${t('onboarding.reading_age', { value: text, age })}${observed}`
}

export function SourcePicker({ open, onOpenChange, org, projectId, site, boundIds, onBound }: SourcePickerProps) {
  const [sources, setSources] = useState<CatalogueSourceView[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [binding, setBinding] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true)
    setFailed(false)
    try {
      const data: CatalogueSourceView[] = []
      const cursors = new Set<string>()
      let cursor: string | undefined
      do {
        const page = await sourcesApi('listCatalogueSources', { query: { limit: 200, cursor } })
        data.push(...page.data)
        cursor = page.next_cursor ?? undefined
        if (cursor && cursors.has(cursor)) throw new Error('Repeated catalogue cursor')
        if (cursor) cursors.add(cursor)
      } while (cursor)
      setSources(data)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) void load()
  }, [open, org])

  const ordered = useMemo(
    () =>
      site.lat === null || site.lon === null
        ? [...sources].sort((left, right) => left.external_id.localeCompare(right.external_id))
        : sortSources(sources as PickerSource[], { lat: site.lat, lon: site.lon }),
    [site, sources]
  )
  const filtered = useMemo(() => filterSources(ordered, query), [ordered, query])
  const byAdapter = useMemo(() => {
    const groups = new Map<string, typeof filtered>()
    for (const source of filtered) groups.set(source.kind, [...(groups.get(source.kind) ?? []), source])
    return [...groups.entries()].sort((left, right) => {
      const leftIndex = ADAPTERS.indexOf(left[0] as (typeof ADAPTERS)[number])
      const rightIndex = ADAPTERS.indexOf(right[0] as (typeof ADAPTERS)[number])
      return (leftIndex < 0 ? ADAPTERS.length : leftIndex) - (rightIndex < 0 ? ADAPTERS.length : rightIndex)
    })
  }, [filtered])

  async function bind(source: CatalogueSourceView) {
    if (binding) return
    setBinding(source.id)
    setMessage('')
    try {
      await sourcesApi('bindSource', { params: { id: projectId }, body: { source_id: source.id } })
      await onBound(source)
      window.dispatchEvent(new Event('onboarding:changed'))
      setMessage(t('onboarding.source_bound'))
    } catch {
      setMessage(t('onboarding.save_error_generic'))
    } finally {
      setBinding(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={styles.pickerDialog} showCloseButton>
        <DialogHeader>
          <DialogTitle>{t('onboarding.sources_title')}</DialogTitle>
          <DialogDescription>{t('onboarding.picker_description')}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="source-search">{t('onboarding.source_search')}</FieldLabel>
          <Input
            id="source-search"
            name="source-search"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </Field>
        {failed ? (
          <div role="alert" className={styles.status}>
            <p>{t('onboarding.source_load_error')}</p>
            <Button type="button" variant="outline" onClick={() => void load()}>
              {t('onboarding.retry')}
            </Button>
          </div>
        ) : loading ? (
          <p role="status">{t('onboarding.loading_sources')}</p>
        ) : byAdapter.length === 0 ? (
          <p>{t('onboarding.no_sources')}</p>
        ) : (
          <div className={styles.sourceGroups}>
            {byAdapter.map(([kind, rows]) => (
              <section className={styles.sourceGroup} key={kind} aria-labelledby={`source-adapter-${kind}`}>
                <h3 id={`source-adapter-${kind}`}>{t(`onboarding.adapter_${kind}`)}</h3>
                <div className={styles.tableScroll}>
                  <table className={styles.sourceTable}>
                    <thead>
                      <tr>
                        <th scope="col">{t('onboarding.source_id')}</th>
                        <th scope="col">{t('onboarding.source_name')}</th>
                        <th scope="col">{t('onboarding.distance_column')}</th>
                        <th scope="col">{t('onboarding.licence')}</th>
                        <th scope="col">{t('onboarding.cadence')}</th>
                        <th scope="col">{t('onboarding.reading')}</th>
                        <th scope="col">
                          <span className="sr-only">{t('onboarding.bind_action')}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((source) => {
                        const sourceRow = source as CatalogueSourceView
                        const distance =
                          site.lat !== null &&
                          site.lon !== null &&
                          Number.isFinite(source.lat) &&
                          Number.isFinite(source.lon)
                            ? distanceKm({ lat: site.lat, lon: site.lon }, source)
                            : null
                        const alreadyBound = boundIds.has(source.id)
                        const sourceError = source.source_state?.state === 'error'
                        return (
                          <tr key={source.id}>
                            <td>
                              <span>{source.external_id}</span>
                              {sourceError && (
                                <span className={styles.sourceError}>
                                  {source.source_state?.http_status == null
                                    ? t('onboarding.source_error_unknown')
                                    : t('onboarding.source_error', { status: source.source_state.http_status })}
                                </span>
                              )}
                            </td>
                            <td>{source.name}</td>
                            <td>
                              {distance === null
                                ? t('onboarding.no_distance')
                                : t('onboarding.distance', { distance: formatDistanceKm(distance) })}
                            </td>
                            <td>
                              {source.licence_label ||
                                (source.licence_id === 'unpublished' ? t('onboarding.no_terms') : source.licence_id)}
                            </td>
                            <td>{cadence(source.cadence_s)}</td>
                            <td>{reading(sourceRow)}</td>
                            <td>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={alreadyBound || binding !== null}
                                onClick={() => void bind(sourceRow)}
                              >
                                {alreadyBound
                                  ? t('onboarding.bound')
                                  : binding === source.id
                                    ? t('onboarding.binding')
                                    : t('onboarding.bind', { source: source.external_id })}
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
        {message && (
          <p className={styles.status} role="status">
            {message}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default SourcePicker
