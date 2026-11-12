'use client'

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '#ui/dialog'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Field, FieldLabel } from '#ui/field'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#ui/table'
import { distanceKm, filterSources, formatDistanceKm, sortSources, type PickerSource } from '../onboarding/model'
import { t, type Locale } from '../onboarding/catalogue'
import { formatNumber, formatTime } from '@skyclause/i18n/format'
import { sourcesApi, type CatalogueSourceView } from './operations'
import styles from '../onboarding/onboarding.module.css'

/** The picker never draws more than this many rows: the API sorts by distance and searches, so a page is enough. */
const PAGE = 50

interface SourcePickerProps {
  open: boolean
  onOpenChange(open: boolean): void
  org: string
  projectId: string
  site: { lat: number | null; lon: number | null }
  boundIds: Set<string>
  onBound(source: CatalogueSourceView): Promise<void> | void
  /** The page's language: the picker is written in it (the packs panel passes its own). */
  locale?: Locale
}

function cadence(seconds: number, locale: Locale) {
  if (seconds % 86400 === 0)
    return seconds === 86400
      ? t('onboarding.day', {}, locale)
      : t('onboarding.cadence_days', { count: seconds / 86400 }, locale)
  if (seconds % 3600 === 0)
    return seconds === 3600
      ? t('onboarding.hour', {}, locale)
      : t('onboarding.cadence_hours', { count: seconds / 3600 }, locale)
  if (seconds % 60 === 0)
    return seconds === 60
      ? t('onboarding.minute', {}, locale)
      : t('onboarding.cadence_minutes', { count: seconds / 60 }, locale)
  return t('onboarding.cadence_seconds', { count: seconds }, locale)
}

/** The newest reading as its value and unit, how old it is, and when it was taken. */
function reading(source: CatalogueSourceView, locale: Locale) {
  const latest = source.latest_reading
  const value = latest?.value ?? latest?.value_text
  if (latest === null || latest === undefined || value === null || value === undefined)
    return t('onboarding.no_reading', {}, locale)
  const unit = latest.unit ?? (source.kind === 'apims' ? 'API' : '')
  const text = typeof value === 'number' ? `${formatNumber(value, locale)}\u00a0${unit}`.trim() : value
  if (source.age_s === null) return text
  const age =
    source.age_s < 90 * 60
      ? t('onboarding.age_minutes', { count: formatNumber(Math.max(1, Math.floor(source.age_s / 60)), locale) }, locale)
      : t('onboarding.age_hours', { count: formatNumber(Math.floor(source.age_s / 3600), locale) }, locale)
  const observed = latest.observed_at
    ? ` · ${t('onboarding.observed_at', { time: formatTime(latest.observed_at, locale) }, locale)}`
    : ''
  return `${t('onboarding.reading_age', { value: text, age }, locale)}${observed}`
}

export function SourcePicker({
  open,
  onOpenChange,
  org,
  projectId,
  site,
  boundIds,
  onBound,
  locale = 'en'
}: SourcePickerProps) {
  const [sources, setSources] = useState<CatalogueSourceView[]>([])
  const [more, setMore] = useState(false)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [binding, setBinding] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [attempt, setAttempt] = useState(0)

  // What is typed reaches the API a moment after the last key: it searches the whole catalogue, nearest first.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setLoading(true)
    setFailed(false)
    sourcesApi('listCatalogueSources', {
      query: {
        limit: PAGE,
        q: search || undefined,
        near: site.lat !== null && site.lon !== null ? `${site.lat},${site.lon}` : undefined
      },
      signal: controller.signal
    })
      .then((page) => {
        if (controller.signal.aborted) return
        setSources(page.data)
        setMore(page.next_cursor !== null)
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [open, org, search, site.lat, site.lon, attempt])

  const ordered = useMemo(
    () =>
      site.lat === null || site.lon === null
        ? [...sources].sort((left, right) => left.external_id.localeCompare(right.external_id))
        : (sortSources(sources as PickerSource[], { lat: site.lat, lon: site.lon }) as CatalogueSourceView[]),
    [site, sources]
  )
  const rows = useMemo(() => filterSources(ordered, query).slice(0, PAGE), [ordered, query])

  async function bind(source: CatalogueSourceView) {
    if (binding) return
    setBinding(source.id)
    setMessage('')
    try {
      await sourcesApi('bindSource', { params: { id: projectId }, body: { source_id: source.id } })
      await onBound(source)
      window.dispatchEvent(new Event('onboarding:changed'))
      setMessage(t('onboarding.source_bound', {}, locale))
    } catch {
      setMessage(t('onboarding.save_error_generic', {}, locale))
    } finally {
      setBinding(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={styles.pickerDialog} showCloseButton>
        <DialogHeader>
          <DialogTitle>{t('onboarding.sources_title', {}, locale)}</DialogTitle>
          <DialogDescription>{t('onboarding.picker_description', {}, locale)}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="source-search">{t('onboarding.source_search', {}, locale)}</FieldLabel>
          <Input
            id="source-search"
            name="source-search"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </Field>
        {failed ? (
          <div role="alert" className={styles.status}>
            <p>{t('onboarding.source_load_error', {}, locale)}</p>
            <Button type="button" variant="outline" onClick={() => setAttempt((value) => value + 1)}>
              {t('onboarding.retry', {}, locale)}
            </Button>
          </div>
        ) : loading ? (
          <p role="status">{t('onboarding.loading_sources', {}, locale)}</p>
        ) : rows.length === 0 ? (
          <p>{t('onboarding.no_sources', {}, locale)}</p>
        ) : (
          <div className={styles.sourceGroups}>
            <Table compact phone="list">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('onboarding.source_id', {}, locale)}</TableHead>
                  <TableHead>{t('onboarding.source_name', {}, locale)}</TableHead>
                  <TableHead numeric>{t('onboarding.distance_column', {}, locale)}</TableHead>
                  <TableHead>{t('onboarding.licence', {}, locale)}</TableHead>
                  <TableHead>{t('onboarding.cadence', {}, locale)}</TableHead>
                  <TableHead>{t('onboarding.reading', {}, locale)}</TableHead>
                  <TableHead>
                    <span className="sr-only">{t('onboarding.bind_action', {}, locale)}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((source) => {
                  const distance =
                    site.lat !== null && site.lon !== null && Number.isFinite(source.lat) && Number.isFinite(source.lon)
                      ? distanceKm({ lat: site.lat, lon: site.lon }, source)
                      : null
                  const alreadyBound = boundIds.has(source.id)
                  const sourceError = source.source_state?.state === 'error'
                  return (
                    <TableRow key={source.id}>
                      <TableCell phone="primary" className="whitespace-normal">
                        <span translate="no">{source.external_id}</span>
                        {sourceError && (
                          <span className={styles.sourceError}>
                            {source.source_state?.http_status == null
                              ? t('onboarding.source_error_unknown', {}, locale)
                              : t('onboarding.source_error', { status: source.source_state.http_status }, locale)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell
                        phone="meta"
                        label={t('onboarding.source_name', {}, locale)}
                        className="whitespace-normal"
                      >
                        {source.name}
                        <span className="block type-small text-muted-foreground">
                          {t(`onboarding.adapter_${source.kind}`, {}, locale)}
                        </span>
                      </TableCell>
                      <TableCell numeric phone="meta" label={t('onboarding.distance_column', {}, locale)}>
                        {distance === null
                          ? t('onboarding.no_distance', {}, locale)
                          : t('onboarding.distance', { distance: formatDistanceKm(distance, locale) }, locale)}
                      </TableCell>
                      <TableCell phone="meta" label={t('onboarding.licence', {}, locale)} className="whitespace-normal">
                        {source.licence_label ||
                          (source.licence_id === 'unpublished'
                            ? t('onboarding.no_terms', {}, locale)
                            : source.licence_id)}
                      </TableCell>
                      <TableCell phone="meta" label={t('onboarding.cadence', {}, locale)}>
                        {cadence(source.cadence_s, locale)}
                      </TableCell>
                      <TableCell phone="meta" label={t('onboarding.reading', {}, locale)} className="whitespace-normal">
                        {reading(source, locale)}
                      </TableCell>
                      <TableCell phone="end">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={alreadyBound || binding !== null}
                          onClick={() => void bind(source)}
                        >
                          {alreadyBound
                            ? t('onboarding.bound', {}, locale)
                            : binding === source.id
                              ? t('onboarding.binding', {}, locale)
                              : t('onboarding.bind', { source: source.external_id }, locale)}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            {more || sources.length > PAGE ? (
              <p className="type-small text-muted-foreground" data-numeric>
                {t('onboarding.nearest_shown', { count: formatNumber(rows.length, locale) }, locale)}
              </p>
            ) : null}
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
