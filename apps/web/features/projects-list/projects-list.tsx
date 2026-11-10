'use client'

import { useEffect, useReducer, useState } from 'react'
import { Button } from '#ui/button'
import { Alert, AlertDescription } from '#ui/alert'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '#ui/empty'
import type { PackState } from '@skyclause/contracts'
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
  const signal = t('organisations.projects.signal', {
    state: health.state,
    reporting: t('organisations.projects.inputsReporting', { count: formatNumber(health.inputs_reporting, 'en') }),
    oldest: age ? ` ${t('organisations.projects.oldestAge', { age })}` : ''
  })
  return (
    <span className={styles.meta}>
      {t('organisations.projects.meta', {
        review: t('organisations.projects.needsReview', { count: formatNumber(summary.windows_at_risk, 'en') }),
        signal
      })}
    </span>
  )
}

function ProjectRow({ item, org, fetchedAt }: { item: ProjectListItem; org: string; fetchedAt: number }) {
  const summary = item.summary
  return (
    <article aria-label={item.name} className={styles.row}>
      <div className={styles.rowMain}>
        <h2>
          <a href={`/${encodeURIComponent(org)}/${encodeURIComponent(item.slug)}`}>{item.name}</a>
        </h2>
        {item.archived_at && <p className={styles.meta}>{t('organisations.projects.archived')}</p>}
      </div>
      <div className={styles.rowSide}>
        <ul className={styles.packs}>
          {(summary?.pack_states ?? []).map((packState) => (
            <li key={packState.pack}>
              <PackStateNote pack={packState} />
              <NoCall packState={packState} />
            </li>
          ))}
        </ul>
        {summary && (
          <p className={styles.meta}>
            <ProjectMeta item={item} fetchedAt={fetchedAt} />
          </p>
        )}
      </div>
    </article>
  )
}

/** `/{org}/projects` from `GET /v1/projects?include=summary`: names, per-pack modes with basis, review counts
 * and signal health. Archived projects sit behind `?archived=1`; the list virtualises above 50 rows. */
export function ProjectsList({ org, canCreate, archived }: { org: string; canCreate: boolean; archived: boolean }) {
  const [items, setItems] = useState<ProjectListItem[] | null>(null)
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)

  async function load(signal?: AbortSignal) {
    setFailed(false)
    try {
      const first = await apiFetch('listProjects', { org, query: { limit: 200, include: 'summary' }, signal })
      setItems(first.data)
      setFetchedAt(Date.now())
    } catch {
      if (!signal?.aborted) {
        setFailed(true)
        setItems([])
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [org])

  if (items === null && !failed) return <p role="status">{t('organisations.projects.title')}</p>
  if (failed)
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('organisations.projects.loadError')}</AlertDescription>
        <Button variant="outline" onClick={() => void load()}>
          {t('organisations.projects.retry')}
        </Button>
      </Alert>
    )

  const visible = (items ?? []).filter((item) => archived === (item.archived_at !== null))
  if (visible.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t('organisations.projects.title')}</EmptyTitle>
          <EmptyDescription>
            {t('organisations.projects.empty')} {t('organisations.projects.count', { count: 0 })}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {canCreate ? (
            <a href={`/${encodeURIComponent(org)}/new`}>{t('organisations.projects.create')}</a>
          ) : (
            <p>{t('organisations.projects.askAdmin')}</p>
          )}
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <section aria-label={t('organisations.projects.title')} className={styles.page}>
      <h1>
        {t('organisations.projects.title')} {t('organisations.projects.count', { count: visible.length })}
      </h1>
      <p>
        <a href={archived ? '?' : '?archived=1'}>
          {t(archived ? 'organisations.projects.hideArchived' : 'organisations.projects.showArchived')}
        </a>
      </p>
      <VirtualRows
        items={visible.map((item) => ({ item, fetchedAt: fetchedAt ?? Date.now() }))}
        label={t('organisations.projects.title')}
        render={({ item, fetchedAt: at }) => <ProjectRow item={item} org={org} fetchedAt={at} />}
      />
      {canCreate ? (
        <p>
          <a href={`/${encodeURIComponent(org)}/new`}>{t('organisations.projects.create')}</a>
        </p>
      ) : (
        <p>{t('organisations.projects.askAdmin')}</p>
      )}
    </section>
  )
}
