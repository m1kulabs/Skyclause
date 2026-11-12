'use client'

import { useState } from 'react'
import { t } from '@skyclause/i18n'
import { formatDateTime, formatNumber } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#ui/table'
import { canDownloadExport, formatExpiryDate, isExportExpired } from './model'
import type { ExportView } from './model'
import '../settings/catalogue'

/** The most export rows on screen at once; older and newer pages walk the jobs already loaded. */
const PAGE_ROWS = 50

export function ExportList({
  jobs,
  locale = 'en',
  hasMore = false,
  loadingMore = false,
  onLoadMore
}: {
  jobs: ExportView[]
  locale?: 'en' | 'ms'
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
}) {
  const [page, setPage] = useState(0)
  const label = (key: string, vars: Record<string, string | number> = {}) => t(`settings.data.${key}`, vars, locale)
  const pages = Math.max(1, Math.ceil(jobs.length / PAGE_ROWS))
  const current = Math.min(page, pages - 1)
  const first = current * PAGE_ROWS
  const rows = jobs.slice(first, first + PAGE_ROWS)

  if (jobs.length === 0) return <p className="type-body text-muted-foreground">{label('noExports')}</p>

  const pager = pages > 1 || (hasMore && onLoadMore)
  return (
    <div className="grid gap-3">
      <div role="region" aria-label={label('exportJobs')}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{label('colStatus')}</TableHead>
              <TableHead>{label('colRequested')}</TableHead>
              <TableHead>{label('colDownload')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((job) => {
              const status = ['queued', 'running', 'ready', 'failed', 'expired'].includes(job.status)
                ? job.status
                : 'failed'
              const expired = isExportExpired(job)
              const canDownload = canDownloadExport(job) && job.expires_at
              const requested = formatDateTime(job.created_at, locale)
              return (
                <TableRow key={job.id} data-export-row dimmed={status === 'expired' || (status === 'ready' && expired)}>
                  <TableCell className="font-medium">{label(`status.${status}`)}</TableCell>
                  <TableCell phone="meta" label={label('colRequested')}>
                    <time dateTime={job.created_at}>{requested}</time>
                  </TableCell>
                  <TableCell className="whitespace-normal" phone="end">
                    {canDownload ? (
                      <span className="flex flex-wrap items-center gap-x-3">
                        <a
                          className="type-body inline-flex min-h-6 items-center underline underline-offset-4 hover:decoration-2 pointer-coarse:min-h-11"
                          href={`/api/exports/${encodeURIComponent(job.id)}/download`}
                          download
                          aria-label={label(job.scope === 'account' ? 'downloadAccountFor' : 'downloadFor', {
                            date: requested
                          })}
                        >
                          {label(job.scope === 'account' ? 'downloadAccount' : 'download')}
                        </a>
                        <span className="type-small text-muted-foreground">
                          {label('linkExpires', { date: formatExpiryDate(job.expires_at!, locale) })}
                        </span>
                      </span>
                    ) : (
                      <span className="type-body text-muted-foreground">
                        {status === 'expired' || (status === 'ready' && expired)
                          ? label('expiredLink')
                          : status === 'queued' || status === 'running'
                            ? label('readyWithin')
                            : status === 'failed'
                              ? label('exportJobFailed')
                              : null}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      {pager && (
        <div className="flex flex-wrap items-center gap-3">
          {pages > 1 && (
            <>
              <span className="type-small text-muted-foreground" data-numeric>
                {label('exportRange', {
                  from: formatNumber(first + 1, locale),
                  to: formatNumber(first + rows.length, locale)
                })}
              </span>
              <Button type="button" variant="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>
                {label('newerExports')}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={current >= pages - 1}
                onClick={() => setPage(current + 1)}
              >
                {label('olderExports')}
              </Button>
            </>
          )}
          {hasMore && onLoadMore && current >= pages - 1 && (
            <Button type="button" variant="outline" onClick={onLoadMore} disabled={loadingMore}>
              {loadingMore ? label('loadingExports') : label('loadMoreExports')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
