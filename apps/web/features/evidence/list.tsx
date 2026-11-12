'use client'

import { useCallback } from 'react'
import { formatDateTime, formatNumber } from '@skyclause/i18n/format'
import { RefreshCwIcon } from 'lucide-react'
import { Button } from '#ui/button'
import { Empty, EmptyHeader, EmptyDescription } from '#ui/empty'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '#ui/table'
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
              {t(
                resource.data.data.length === 1 ? 'evidence.requestCount_one' : 'evidence.requestCount',
                { n: formatNumber(resource.data.data.length, locale) },
                locale
              )}
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
              <Table className="evidence-rows">
                <TableCaption className="sr-only">{t('ledger.evidence', {}, locale)}</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{t('evidence.columns.span', {}, locale)}</TableHead>
                    <TableHead scope="col">{t('evidence.columns.status', {}, locale)}</TableHead>
                    <TableHead scope="col">{t('evidence.columns.received', {}, locale)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resource.data.data.map((request) => (
                    <TableRow key={request.id} data-evidence-row={request.id}>
                      <TableCell phone="primary">
                        <a
                          className="ledger-link evidence-row-span"
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
                          <SpanTimes from={request.span.from} to={request.span.to} locale={locale} />
                        </a>
                      </TableCell>
                      <TableCell phone="end">
                        <RequestStatus request={request} guest={guest} locale={locale} />
                      </TableCell>
                      <TableCell>
                        <time dateTime={request.received_at}>
                          {t('evidence.receivedAt', { time: formatDateTime(request.received_at, locale) }, locale)}
                        </time>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
