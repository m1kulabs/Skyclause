'use client'

import { useMemo, useState } from 'react'
import { t } from '@skyclause/i18n'
import { canDownloadExport, formatExpiryDate, isExportExpired } from './model'
import type { ExportView } from './model'
import '../settings/catalogue'
import styles from './export-list.module.css'

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
  const [scrollTop, setScrollTop] = useState(0)
  const label = (key: string, vars: Record<string, string | number> = {}) => t(`settings.data.${key}`, vars, locale)
  const virtual = jobs.length > 50
  const rowHeight = 124
  const visible = useMemo(() => {
    if (!virtual) return { rows: jobs, before: 0, after: 0 }
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 3)
    const rows = jobs.slice(start, start + 13)
    return {
      rows,
      before: start * rowHeight,
      after: Math.max(0, (jobs.length - start - rows.length) * rowHeight)
    }
  }, [jobs, scrollTop, virtual])

  if (jobs.length === 0) return <p className="text-sm text-muted-foreground">{label('noExports')}</p>

  return (
    <div>
      <div
        className={styles.region}
        role="region"
        aria-label={label('exportJobs')}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <ul className={styles.list}>
          {virtual && <li aria-hidden="true" className={styles.spacer} style={{ height: visible.before }} />}
          {visible.rows.map((job) => {
            const status = ['queued', 'running', 'ready', 'failed', 'expired'].includes(job.status)
              ? job.status
              : 'failed'
            const expired = isExportExpired(job)
            const canDownload = canDownloadExport(job) && job.expires_at
            return (
              <li key={job.id} className={styles.row} data-export-row>
                <p className="font-medium">{label(`status.${status}`)}</p>
                {canDownload ? (
                  <a
                    className="min-h-11 w-fit py-2 text-sm underline underline-offset-4"
                    href={`/api/exports/${encodeURIComponent(job.id)}/download`}
                    download
                    aria-label={label(job.scope === 'account' ? 'downloadAccountFor' : 'downloadFor', { id: job.id })}
                  >
                    {label(job.scope === 'account' ? 'downloadAccount' : 'download')}
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {status === 'expired' || (status === 'ready' && expired)
                      ? label('expiredLink')
                      : status === 'queued' || status === 'running'
                        ? label('readyWithin')
                        : status === 'failed'
                          ? (job.error ?? label('exportFailed'))
                          : null}
                  </p>
                )}
                {canDownload && job.expires_at && (
                  <p className="text-sm text-muted-foreground">
                    {label('linkExpires', { date: formatExpiryDate(job.expires_at, locale) })}
                  </p>
                )}
              </li>
            )
          })}
          {virtual && <li aria-hidden="true" className={styles.spacer} style={{ height: visible.after }} />}
        </ul>
      </div>
      {hasMore && onLoadMore && (
        <button
          type="button"
          className="mt-3 min-h-11 rounded-md border border-border px-3 text-sm"
          onClick={onLoadMore}
          disabled={loadingMore}
        >
          {loadingMore ? label('loadingExports') : label('loadMoreExports')}
        </button>
      )}
    </div>
  )
}
