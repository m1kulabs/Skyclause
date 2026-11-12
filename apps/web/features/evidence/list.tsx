'use client'

import { useCallback } from 'react'
import { formatDateTime, formatNumber } from '@skyclause/i18n/format'
import { RefreshCwIcon } from 'lucide-react'
import { Button } from '#ui/button'
import { Empty, EmptyHeader, EmptyDescription } from '#ui/empty'
import { apiFetch } from '../ledger/operations'
import { useRead } from '../ledger/use-read'
import { Failure, Loading } from '../ledger/feedback'
import { SpanTimes } from '../ledger/table'
import { t } from '../ledger/i18n'
import { RequestStatus } from './pack'

/** The requests made of this project's record, newest first: each opens its pack. */
export function EvidenceList({
  projectId,
  guest,
  locale,
  evidenceHref,
  onOpen,
  cursor,
  onNext
}: {
  projectId: string
  guest: boolean
  locale: 'en' | 'ms'
  evidenceHref: (id: string) => string
  onOpen: (id: string, trigger: HTMLAnchorElement) => void
  cursor?: string
  onNext: (cursor: string) => void
}) {
  const read = useCallback(
    (signal: AbortSignal) =>
      apiFetch('listEvidenceRequests', { params: { id: projectId }, query: { cursor, limit: 50 }, signal }),
    [projectId, cursor]
  )
  const resource = useRead(read, true)
  return (
    <section className="evidence-list" aria-labelledby="evidence-list-title">
      <div className="ledger-toolbar">
        <h2 id="evidence-list-title" className="ledger-section-title">
          {t('ledger.evidence', {}, locale)}
          {resource.data && (
            <span className="ledger-n" data-numeric>
              {t('evidence.count', { n: formatNumber(resource.data.data.length, locale) }, locale)}
            </span>
          )}
        </h2>
        <Button variant="ghost" size="sm" onClick={resource.retry}>
          <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
          {t('evidence.refresh', {}, locale)}
        </Button>
      </div>
      {resource.loading ? (
        <Loading locale={locale} rows={3} />
      ) : resource.error ? (
        <Failure
          source="requests"
          error={resource.error}
          at={resource.failedAt}
          retry={resource.retry}
          locale={locale}
        />
      ) : (
        resource.data && (
          <>
            {resource.data.data.length ? (
              <ul className="evidence-rows">
                {resource.data.data.map((request) => (
                  <li key={request.id}>
                    <a
                      href={evidenceHref(request.id)}
                      onClick={(event) => {
                        if (
                          !event.metaKey &&
                          !event.ctrlKey &&
                          !event.shiftKey &&
                          !event.altKey &&
                          event.button === 0
                        ) {
                          event.preventDefault()
                          onOpen(request.id, event.currentTarget)
                        }
                      }}
                    >
                      <span className="evidence-row-span">
                        <SpanTimes from={request.span.from} to={request.span.to} locale={locale} />
                      </span>
                      <RequestStatus request={request} guest={guest} locale={locale} />
                      <span className="evidence-row-meta">
                        <span translate="no">{t('evidence.packFor', { id: request.id }, locale)}</span>
                        <time dateTime={request.received_at}>
                          {t('evidence.receivedAt', { time: formatDateTime(request.received_at, locale) }, locale)}
                        </time>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty className="ledger-empty">
                <EmptyHeader>
                  <EmptyDescription>{t('evidence.empty', {}, locale)}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            {resource.data.next_cursor && (
              <div className="ledger-pager">
                <Button variant="outline" onClick={() => onNext(resource.data!.next_cursor!)}>
                  {t('evidence.more', {}, locale)}
                </Button>
              </div>
            )}
          </>
        )
      )}
    </section>
  )
}
