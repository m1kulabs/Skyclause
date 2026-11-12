'use client'

import type { MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { CallView } from '@skyclause/contracts'
import { Button } from '#ui/button'
import { Skeleton } from '#ui/skeleton'
import { TriageRow } from '#ui/triage-layout'
import { ModeBadge } from '../brand/mode-badge'
import { SourceError } from '../data-components/states'
import type { BundleListItem } from './operations'
import type { BundleList as ListState } from './use-project-bundles'
import { SlaCapsule, timeInWords } from './time'
import { t } from './i18n'
import { callMark, LIST_LIMIT, markRank, type CallMark } from './model'

/** The bundle's leading call: the highest mode among its calls, so a row shows what it would send. */
function leadingMark(calls: readonly CallView[]): CallMark | null {
  const marks = calls.map(callMark)
  return markRank.find((mark) => marks.includes(mark)) ?? null
}

const waiting = (bundle: Pick<BundleListItem, 'state'>) => ['needs_review', 'reconfirm'].includes(bundle.state)

export function BundleList({
  list,
  current,
  now,
  basePath,
  onRetry,
  onChoose
}: {
  list: ListState
  current: string
  now: number
  basePath: string
  onRetry: () => void
  onChoose: (id: string) => void
}) {
  const router = useRouter()
  const open = (event: MouseEvent<HTMLAnchorElement>, id: string, href: string) => {
    onChoose(id)
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    if (id !== current) router.push(href)
  }
  return (
    <div className="bundle-list">
      <header className="bundle-list-head">
        <h2>{t('bundles.list_title')}</h2>
        {list.status === 'ready' && (
          <span className="type-small text-muted-foreground" data-numeric>
            {t('bundles.list_count', { count: list.rows.length })}
          </span>
        )}
      </header>
      {list.status === 'loading' && (
        <ol className="bundle-list-rows" aria-busy="true" aria-label={t('bundles.list_loading')}>
          {Array.from({ length: 4 }, (_, index) => (
            <li key={index} className="flex min-h-16 flex-col justify-center gap-2 px-3">
              <Skeleton className="h-4 w-40 rounded-full" />
              <Skeleton className="h-6 w-28 rounded-full" />
            </li>
          ))}
        </ol>
      )}
      {list.status === 'error' && (
        <SourceError
          source={t('bundles.list_source')}
          status={list.code}
          at={list.at}
          retry={
            <Button variant="outline" onClick={onRetry}>
              {t('bundles.list_retry')}
            </Button>
          }
        />
      )}
      {list.status === 'ready' && !list.rows.length && <p className="bundle-list-note">{t('bundles.list_empty')}</p>}
      {list.status === 'ready' && list.rows.length > 0 && (
        <ol className="bundle-list-rows">
          {list.rows.map((bundle) => {
            const href = `${basePath}/bundles/${encodeURIComponent(bundle.id)}`
            const mark = leadingMark(bundle.calls)
            const selected = bundle.id === current
            return (
              <li key={bundle.id}>
                <TriageRow
                  href={href}
                  selected={selected}
                  data-waiting={waiting(bundle) || undefined}
                  className="bundle-row"
                  onClick={(event) => open(event, bundle.id, href)}
                >
                  <span className="bundle-row-line">
                    <span className="bundle-row-title">
                      {t('bundles.row_title', {
                        pack: t(`bundles.packs.${bundle.pack}`),
                        trigger: t(`bundles.triggers.${bundle.trigger}`)
                      })}
                    </span>
                    <time dateTime={bundle.triggered_at} className="bundle-row-meta">
                      {timeInWords(bundle.triggered_at, now)}
                    </time>
                  </span>
                  <span className="bundle-row-line">
                    {mark ? (
                      <ModeBadge mode={mark} />
                    ) : (
                      <span className="bundle-row-meta">{t('bundles.row_no_calls')}</span>
                    )}
                    {waiting(bundle) && bundle.sla_due_at ? (
                      <SlaCapsule due={bundle.sla_due_at} now={now} />
                    ) : (
                      <span className="bundle-row-meta">{t(`bundles.bundle_states.${bundle.state}`)}</span>
                    )}
                  </span>
                </TriageRow>
              </li>
            )
          })}
        </ol>
      )}
      {list.status === 'ready' && list.more && (
        <p className="bundle-list-note">{t('bundles.list_more', { count: LIST_LIMIT })}</p>
      )}
    </div>
  )
}
