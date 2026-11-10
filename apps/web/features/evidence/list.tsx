'use client'

import { useCallback } from 'react'
import { formatDateTime } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { Empty, EmptyHeader, EmptyDescription } from '#ui/empty'
import { apiFetch } from '../ledger/operations'
import { useRead } from '../ledger/use-read'
import { Failure, Loading } from '../ledger/feedback'
import { t } from '../ledger/i18n'
import { RequestStatus } from './pack'

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
    <section className="evidence-list">
      <Button variant="outline" onClick={resource.retry}>
        {t('evidence.refresh', {}, locale)}
      </Button>
      {resource.loading ? (
        <Loading locale={locale} />
      ) : resource.error ? (
        <Failure error={resource.error} retry={resource.retry} locale={locale} />
      ) : (
        resource.data && (
          <>
            {resource.data.data.length ? (
              <ul>
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
                      <span>{t('evidence.packFor', { id: request.id }, locale)}</span>
                      <RequestStatus request={request} guest={guest} locale={locale} />
                      <time dateTime={request.received_at}>{formatDateTime(request.received_at, locale)}</time>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyDescription>{t('evidence.empty', {}, locale)}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            {resource.data.next_cursor && (
              <Button variant="outline" onClick={() => onNext(resource.data!.next_cursor!)}>
                {t('evidence.more', {}, locale)}
              </Button>
            )}
          </>
        )
      )}
    </section>
  )
}
