'use client'

import { useCallback, useEffect, useState } from 'react'
import { t } from '@skyclause/i18n'
import { Button } from '../../components/ui/button'
import { TypedConfirmDialog } from '../settings/set-7/confirm-dialog'
import { accountApiFetch, type AccountExport } from './operations'
import { ExportList } from './export-list'
import { problemSlug } from './model'
import '../settings/catalogue'

type Membership = {
  id: string
  role: string
  org_name: string
  org_slug: string
}

export function AccountDataPanel({ email, locale = 'en' }: { email: string | null; locale?: 'en' | 'ms' }) {
  const [exports, setExports] = useState<AccountExport[]>([])
  const [exportCursor, setExportCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [exportError, setExportError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [transferOrganisations, setTransferOrganisations] = useState<Membership[]>([])
  const [membershipsLoaded, setMembershipsLoaded] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const label = useCallback(
    (key: string, vars: Record<string, string | number> = {}) => t(`settings.data.${key}`, vars, locale),
    [locale]
  )

  const loadExports = useCallback(async (cursor?: string | null) => {
    const page = await accountApiFetch('listMyExports', { query: { limit: 50, cursor: cursor ?? undefined } })
    setExports((current) => {
      const incoming = new Set(page.data.map((job) => job.id))
      return cursor
        ? [...current.filter((job) => !incoming.has(job.id)), ...page.data]
        : [...page.data, ...current.filter((job) => !incoming.has(job.id))]
    })
    setExportCursor(page.next_cursor)
  }, [])

  useEffect(() => {
    let active = true
    void loadExports()
      .catch(() => active && setExportError(label('exportFailed')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [label, loadExports])

  useEffect(() => {
    if (!exports.some((job) => job.status === 'queued' || job.status === 'running')) return
    const timer = window.setInterval(() => {
      void loadExports().catch(() => setExportError(label('exportFailed')))
    }, 10_000)
    return () => window.clearInterval(timer)
  }, [exports, label, loadExports])

  const requestExport = async () => {
    setExportError('')
    try {
      const job = await accountApiFetch('createMyExport', { body: { format: 'json' } })
      setExports((current) => [job, ...current.filter((entry) => entry.id !== job.id)])
    } catch (error) {
      setExportError(problemSlug(error) === 'export-pending' ? label('exportPending') : label('exportFailed'))
    }
  }

  const loadMoreExports = async () => {
    if (!exportCursor || loadingMore) return
    setLoadingMore(true)
    try {
      await loadExports(exportCursor)
    } catch {
      setExportError(label('exportFailed'))
    } finally {
      setLoadingMore(false)
    }
  }

  const fetchOwnedOrganisations = async () => {
    const owned: Membership[] = []
    let cursor: string | null = null
    let visited: string | null = null
    do {
      const page: { data: Membership[]; next_cursor: string | null } = await accountApiFetch('listMyMemberships', {
        query: { limit: 100, cursor: cursor ?? undefined }
      })
      owned.push(...page.data.filter((membership) => membership.role === 'owner'))
      visited = cursor
      cursor = page.next_cursor
    } while (cursor && cursor !== visited)
    return owned
  }

  const deleteAccount = async () => {
    if (!email) throw new Error('The account email is unavailable')
    setDeleteError('')
    setTransferOrganisations([])
    setMembershipsLoaded(false)
    try {
      await accountApiFetch('deleteMyAccount', { body: { email } })
      setDeleted(true)
    } catch (error) {
      if (problemSlug(error) === 'sole-owner') {
        try {
          setTransferOrganisations(await fetchOwnedOrganisations())
          setMembershipsLoaded(true)
          setDeleteError(label('soleOwner'))
        } catch {
          setDeleteError(`${label('soleOwner')} ${label('membershipsUnavailable')}`)
        }
        return
      }
      setDeleteError(label('accountDeleteFailed'))
      throw new Error('Account deletion request failed')
    }
  }

  return (
    <div className="grid gap-8">
      <section aria-labelledby="account-data-title" className="grid gap-4">
        <div>
          <h2 id="account-data-title" className="text-base font-semibold">
            {label('accountTitle')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{label('accountDescription')}</p>
          <p className="mt-2 text-sm text-muted-foreground">{label('readyWithin')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" className="min-h-11" onClick={() => void requestExport()}>
            {label('requestAccountExport')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => void loadExports().catch(() => setExportError(label('exportFailed')))}
          >
            {label('refreshExports')}
          </Button>
          {loading && (
            <span role="status" className="text-sm text-muted-foreground">
              {label('loadingExports')}
            </span>
          )}
        </div>
        {exportError && (
          <p role="status" className="text-sm text-destructive">
            {exportError}
          </p>
        )}
        <ExportList
          jobs={exports}
          locale={locale}
          hasMore={Boolean(exportCursor)}
          loadingMore={loadingMore}
          onLoadMore={() => void loadMoreExports()}
        />
      </section>

      <section
        aria-labelledby="delete-account-title"
        className="grid justify-items-start gap-3 rounded-md border border-destructive/60 p-4"
      >
        <h2 id="delete-account-title" className="text-base font-semibold text-destructive">
          {label('deleteAccount')}
        </h2>
        {deleted ? (
          <p role="status">{label('accountDeletionScheduled')}</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{label('deleteAccountDescription')}</p>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              disabled={!email}
              onClick={() => setDeleteOpen(true)}
            >
              {label('deleteAccount')}
            </Button>
            {!email && (
              <p role="status" className="text-sm text-muted-foreground">
                {label('accountDeleteUnavailable')}
              </p>
            )}
          </>
        )}
        {deleteError && (
          <p role="alert" className="text-sm text-destructive">
            {deleteError}
          </p>
        )}
        {deleteError && transferOrganisations.length > 0 && (
          <ul className="grid gap-2">
            {transferOrganisations.map((membership) => (
              <li key={membership.id}>
                <a
                  className="min-h-11 py-2 underline underline-offset-4"
                  href={`/${encodeURIComponent(membership.org_slug)}/settings/members`}
                >
                  {label('transferOwnership', { name: membership.org_name })}
                </a>
              </li>
            ))}
          </ul>
        )}
        {deleteError && membershipsLoaded && transferOrganisations.length === 0 && (
          <p className="text-sm text-muted-foreground">{label('noOwnedOrganisations')}</p>
        )}
      </section>

      <TypedConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        objectName={email ?? ''}
        title={label('deleteAccount')}
        confirmLabel={label('deleteAccount')}
        description={label('deleteAccountDescription')}
        onConfirm={deleteAccount}
        locale={locale}
      />
    </div>
  )
}

export default AccountDataPanel
