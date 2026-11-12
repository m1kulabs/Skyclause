'use client'

import { useEffect, useReducer, useState } from 'react'
import { Button, buttonVariants } from '#ui/button'
import { Skeleton } from '#ui/skeleton'
import type { PackState } from '@skyclause/contracts'
import { ApiProblem } from '../../lib/api-fetch'
import { SourceError } from '../data-components/states'
import { formatAge, formatNumber, formatTime } from '@skyclause/i18n/format'
import { PackStateNote } from '../data-components/pack-state-note'
import { indicatorName } from '../data-components/indicator-names'
import { VirtualRows } from '../windows/virtual-rows'
import { brandStates } from '@skyclause/elements'
import { t as brandText } from '@skyclause/i18n/brand'
import { t, type Locale } from '../organisations/catalogue'
import { apiFetch, type ProjectListItem } from '../organisations/operations'
import styles from './projects-list.module.css'

// Ages tick at least once a minute (NFR-1), sharing one timer per list.
const ticks = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

/** Test-only reset for the shared minute timer. */
export function __resetProjectAgeTimerForTests(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
  ticks.clear()
}

function useMinuteTick(): void {
  const [, bump] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (timer === null) {
      timer = setInterval(() => {
        for (const notify of [...ticks]) notify()
      }, 60_000)
    }
    ticks.add(bump)
    return () => {
      ticks.delete(bump)
    }
  }, [])
}

function NoCall({ packState, locale }: { packState: PackState; locale: Locale }) {
  const first = packState.no_call?.inputs[0]
  if (!first) return null
  return (
    <span>
      {t(
        'organisations.projects.noCall',
        { input: indicatorName(first.name, locale), time: formatTime(first.since, locale) },
        locale
      )}
    </span>
  )
}

function ProjectMeta({ item, fetchedAt, locale }: { item: ProjectListItem; fetchedAt: number; locale: Locale }) {
  useMinuteTick()
  const summary = item.summary
  if (!summary) return null
  const health = summary.signal_health
  // The summary's age is frozen at fetch; add the minute ticks since, so the worst age keeps growing (NFR-1).
  const ageS =
    health.oldest_age_s !== null && health.oldest_age_s !== undefined
      ? health.oldest_age_s + Math.max(0, Math.floor((Date.now() - fetchedAt) / 1000))
      : null
  const age = ageS !== null ? formatAge(new Date(Date.now() - ageS * 1000).toISOString(), locale) : null
  return (
    <div className={styles.meta}>
      {/* A zero is printed as a zero, quietly: only a count that needs someone is set in the card title. */}
      <p className={summary.windows_at_risk > 0 ? 'type-card-title' : 'type-body text-muted-foreground'} data-numeric>
        {t('organisations.projects.needsReview', { count: formatNumber(summary.windows_at_risk, locale) }, locale)}
      </p>
      <p className="type-small text-muted-foreground">
        {t(
          'organisations.projects.signal',
          {
            state: brandText(brandStates[health.state].word, {}, locale),
            reporting: t(
              health.inputs_reporting === 1
                ? 'organisations.projects.inputsReporting_one'
                : 'organisations.projects.inputsReporting',
              { count: formatNumber(health.inputs_reporting, locale) },
              locale
            ),
            oldest: age ? ` ${t('organisations.projects.oldestAge', { age }, locale)}` : ''
          },
          locale
        )}
      </p>
    </div>
  )
}

function ProjectRow({
  item,
  org,
  fetchedAt,
  locale
}: {
  item: ProjectListItem
  org: string
  fetchedAt: number
  locale: Locale
}) {
  const summary = item.summary
  return (
    <div className={styles.rowWrap}>
      <article aria-label={item.name} className={styles.row}>
        <div className={styles.identity}>
          <h2 className="type-card-title">
            <a className={styles.name} href={`/${encodeURIComponent(org)}/${encodeURIComponent(item.slug)}`}>
              {item.name}
            </a>
          </h2>
          {item.site_name ? <p className="type-small text-muted-foreground">{item.site_name}</p> : null}
          {item.archived_at && (
            <p className="type-small text-muted-foreground">{t('organisations.projects.archived', {}, locale)}</p>
          )}
        </div>
        <ul className={styles.packs}>
          {(summary?.pack_states ?? []).map((packState) => (
            <li key={packState.pack}>
              <PackStateNote pack={packState} locale={locale} />
              <NoCall packState={packState} locale={locale} />
            </li>
          ))}
        </ul>
        {summary ? <ProjectMeta item={item} fetchedAt={fetchedAt} locale={locale} /> : null}
      </article>
    </div>
  )
}

/** `/{org}/projects` from `GET /v1/projects?include=summary`: names, per-pack modes with basis, review counts
 * and signal health. Archived projects sit behind `?archived=1`; the list virtualises above 50 rows. */
export function ProjectsList({
  org,
  canCreate,
  archived,
  locale = 'en'
}: {
  org: string
  canCreate: boolean
  archived: boolean
  locale?: Locale
}) {
  const [items, setItems] = useState<ProjectListItem[] | null>(null)
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)
  const [failure, setFailure] = useState<{ status: number | null; at: string } | null>(null)

  async function load(signal?: AbortSignal) {
    setFailure(null)
    try {
      const first = await apiFetch('listProjects', { org, query: { limit: 200, include: 'summary' }, signal })
      setItems(first.data)
      setFetchedAt(Date.now())
    } catch (error) {
      if (!signal?.aborted) {
        setFailure({ status: error instanceof ApiProblem ? error.status : null, at: new Date().toISOString() })
        setItems([])
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [org])

  const loading = items === null && !failure
  const visible = (items ?? []).filter((item) => archived === (item.archived_at !== null))
  const hasArchived = (items ?? []).some((item) => item.archived_at !== null)
  const ready = !loading && !failure
  const createHref = `/${encodeURIComponent(org)}/new`
  const nextAction = canCreate ? (
    <a href={createHref} className={buttonVariants()}>
      {t('organisations.projects.create', {}, locale)}
    </a>
  ) : (
    <p className="type-text">{t('organisations.projects.askAdmin', {}, locale)}</p>
  )
  // Archived projects are one click away whenever there are any (or while looking at them), whatever the active list holds.
  const toggle =
    ready && (hasArchived || archived) ? (
      <a className={styles.toggle} href={archived ? '?' : '?archived=1'}>
        {t(archived ? 'organisations.projects.hideArchived' : 'organisations.projects.showArchived', {}, locale)}
      </a>
    ) : null

  return (
    <section
      aria-labelledby="projects-title"
      aria-busy={loading || undefined}
      className={styles.page}
      data-projects-list
    >
      <header className={styles.head}>
        <div className={styles.title}>
          <h1 id="projects-title" className="type-title">
            {t('organisations.projects.title', {}, locale)}
          </h1>
          {ready && visible.length > 0 ? (
            <span className="type-small text-muted-foreground" data-numeric>
              {t(
                visible.length === 1 ? 'organisations.projects.count_one' : 'organisations.projects.count',
                { count: formatNumber(visible.length, locale) },
                locale
              )}
            </span>
          ) : null}
        </div>
        {ready && (visible.length > 0 || toggle) ? (
          <div className={styles.actions}>
            {toggle}
            {visible.length > 0 ? nextAction : null}
          </div>
        ) : null}
      </header>
      {loading ? (
        <div className={styles.rows}>
          <p className="sr-only" role="status">
            {t('organisations.projects.loading', {}, locale)}
          </p>
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} aria-hidden="true" className="h-[88px] w-full rounded-xl" />
          ))}
        </div>
      ) : failure ? (
        <SourceError
          source={t('organisations.projects.source', {}, locale)}
          status={failure.status}
          at={failure.at}
          locale={locale}
          // A 501 is "not built": reading again cannot change the answer.
          retry={
            failure.status === 501 ? undefined : (
              <Button type="button" variant="outline" onClick={() => void load()}>
                {t('organisations.projects.retry', {}, locale)}
              </Button>
            )
          }
        />
      ) : visible.length === 0 ? (
        <div className={styles.empty} data-slot="empty">
          <p className="type-text">
            {t(
              archived
                ? 'organisations.projects.emptyArchived'
                : hasArchived
                  ? 'organisations.projects.emptyActive'
                  : 'organisations.projects.empty',
              {},
              locale
            )}
          </p>
          {archived ? null : nextAction}
        </div>
      ) : (
        <VirtualRows
          className={styles.rows}
          items={visible.map((item) => ({ item, fetchedAt: fetchedAt ?? Date.now() }))}
          label={t('organisations.projects.title', {}, locale)}
          render={({ item, fetchedAt: at }) => <ProjectRow item={item} org={org} fetchedAt={at} locale={locale} />}
        />
      )}
    </section>
  )
}
