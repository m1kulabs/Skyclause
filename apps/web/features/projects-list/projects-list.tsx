'use client'

import { useEffect, useReducer, useState } from 'react'
import { Button, buttonVariants } from '#ui/button'
import { Skeleton } from '#ui/skeleton'
import type { PackState } from '@skyclause/contracts'
import { ApiProblem } from '../../lib/api-fetch'
import { SourceError } from '../data-components/states'
import { formatAge, formatNumber, formatTime } from '@skyclause/i18n/format'
import { PackStateNote } from '../data-components/pack-state-note'
import { VirtualRows } from '../windows/virtual-rows'
import { t } from '../organisations/catalogue'
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

function NoCall({ packState }: { packState: PackState }) {
  const first = packState.no_call?.inputs[0]
  if (!first) return null
  return <span>{t('organisations.projects.noCall', { input: first.name, time: formatTime(first.since, 'en') })}</span>
}

function ProjectMeta({ item, fetchedAt }: { item: ProjectListItem; fetchedAt: number }) {
  useMinuteTick()
  const summary = item.summary
  if (!summary) return null
  const health = summary.signal_health
  // The summary's age is frozen at fetch; add the minute ticks since, so the worst age keeps growing (NFR-1).
  const ageS =
    health.oldest_age_s !== null && health.oldest_age_s !== undefined
      ? health.oldest_age_s + Math.max(0, Math.floor((Date.now() - fetchedAt) / 1000))
      : null
  const age = ageS !== null ? formatAge(new Date(Date.now() - ageS * 1000).toISOString(), 'en') : null
  return (
    <div className={styles.meta}>
      {/* A zero is printed as a zero, quietly: only a count that needs someone is set in the card title. */}
      <p className={summary.windows_at_risk > 0 ? 'type-card-title' : 'type-body text-muted-foreground'} data-numeric>
        {t('organisations.projects.needsReview', { count: formatNumber(summary.windows_at_risk, 'en') })}
      </p>
      <p className="type-small text-muted-foreground">
        {t('organisations.projects.signal', {
          state: health.state,
          reporting: t('organisations.projects.inputsReporting', {
            count: formatNumber(health.inputs_reporting, 'en')
          }),
          oldest: age ? ` ${t('organisations.projects.oldestAge', { age })}` : ''
        })}
      </p>
    </div>
  )
}

function ProjectRow({ item, org, fetchedAt }: { item: ProjectListItem; org: string; fetchedAt: number }) {
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
            <p className="type-small text-muted-foreground">{t('organisations.projects.archived')}</p>
          )}
        </div>
        <ul className={styles.packs}>
          {(summary?.pack_states ?? []).map((packState) => (
            <li key={packState.pack}>
              <PackStateNote pack={packState} />
              <NoCall packState={packState} />
            </li>
          ))}
        </ul>
        {summary ? <ProjectMeta item={item} fetchedAt={fetchedAt} /> : null}
      </article>
    </div>
  )
}

/** `/{org}/projects` from `GET /v1/projects?include=summary`: names, per-pack modes with basis, review counts
 * and signal health. Archived projects sit behind `?archived=1`; the list virtualises above 50 rows. */
export function ProjectsList({ org, canCreate, archived }: { org: string; canCreate: boolean; archived: boolean }) {
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
  const createHref = `/${encodeURIComponent(org)}/new`
  const nextAction = canCreate ? (
    <a href={createHref} className={buttonVariants()}>
      {t('organisations.projects.create')}
    </a>
  ) : (
    <p className="type-text">{t('organisations.projects.askAdmin')}</p>
  )

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
            {t('organisations.projects.title')}
          </h1>
          {!loading && !failure && visible.length > 0 ? (
            <span className="type-small text-muted-foreground" data-numeric>
              {t('organisations.projects.count', { count: visible.length })}
            </span>
          ) : null}
        </div>
        {!loading && !failure && visible.length > 0 ? (
          <div className={styles.actions}>
            <a className={styles.toggle} href={archived ? '?' : '?archived=1'}>
              {t(archived ? 'organisations.projects.hideArchived' : 'organisations.projects.showArchived')}
            </a>
            {nextAction}
          </div>
        ) : null}
      </header>
      {loading ? (
        <div className={styles.rows}>
          <p className="sr-only" role="status">
            {t('organisations.projects.loading')}
          </p>
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} aria-hidden="true" className="h-[88px] w-full rounded-xl" />
          ))}
        </div>
      ) : failure ? (
        <SourceError
          source={t('organisations.projects.source')}
          status={failure.status}
          at={failure.at}
          retry={
            <Button type="button" variant="outline" onClick={() => void load()}>
              {t('organisations.projects.retry')}
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <div className={styles.empty} data-slot="empty">
          <p className="type-text">{t('organisations.projects.empty')}</p>
          {nextAction}
        </div>
      ) : (
        <VirtualRows
          className={styles.rows}
          items={visible.map((item) => ({ item, fetchedAt: fetchedAt ?? Date.now() }))}
          label={t('organisations.projects.title')}
          render={({ item, fetchedAt: at }) => <ProjectRow item={item} org={org} fetchedAt={at} />}
        />
      )}
    </section>
  )
}
