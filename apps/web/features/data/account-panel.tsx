'use client'

import { useCallback, useEffect, useState } from 'react'
import { t } from '@skyclause/i18n'
import { Button } from '../../components/ui/button'
import {
  SettingsAside,
  SettingsDanger,
  SettingsError,
  SettingsPart,
  SettingsParts,
  SettingsStatus,
  SettingsSummaryLine
} from '../settings/parts'
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
    <div data-account-panel="data" aria-busy={loading}>
      <SettingsAside>
        <SettingsSummaryLine label={label('summaryExports')}>
          {loading ? label('loadingExports') : label('summaryExportCount', { count: exports.length })}
        </SettingsSummaryLine>
        <SettingsSummaryLine label={label('summaryErase')}>{label('summaryEraseValue')}</SettingsSummaryLine>
      </SettingsAside>
      <SettingsParts>
        <SettingsPart title={label('accountTitle')} description={label('accountDescription')} id="account-data-title">
          <p className="type-small text-muted-foreground">{label('readyWithin')}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => void requestExport()}>
              {label('requestAccountExport')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadExports().catch(() => setExportError(label('exportFailed')))}
            >
              {label('refreshExports')}
            </Button>
            {loading && <SettingsStatus>{label('loadingExports')}</SettingsStatus>}
          </div>
          {exportError && <SettingsError>{exportError}</SettingsError>}
          <ExportList
            jobs={exports}
            locale={locale}
            hasMore={Boolean(exportCursor)}
            loadingMore={loadingMore}
            onLoadMore={() => void loadMoreExports()}
          />
        </SettingsPart>

        <SettingsDanger
          id="delete-account-title"
          title={label('deleteAccount')}
          description={label('deleteAccountConsequence')}
        >
          {deleted ? (
            <SettingsStatus>{label('accountDeletionScheduled')}</SettingsStatus>
          ) : (
            <>
              <Button type="button" variant="destructive" disabled={!email} onClick={() => setDeleteOpen(true)}>
                {label('deleteAccount')}
              </Button>
              {!email && <SettingsStatus>{label('accountDeleteUnavailable')}</SettingsStatus>}
            </>
          )}
          {deleteError && <SettingsError>{deleteError}</SettingsError>}
          {deleteError && transferOrganisations.length > 0 && (
            <ul className="m-0 grid w-full list-none gap-2 p-0">
              {transferOrganisations.map((membership) => (
                <li key={membership.id}>
                  <a
                    className="inline-flex min-h-9 items-center underline underline-offset-4"
                    href={`/${encodeURIComponent(membership.org_slug)}/settings/members`}
                  >
                    {label('transferOwnership', { name: membership.org_name })}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {deleteError && membershipsLoaded && transferOrganisations.length === 0 && (
            <p className="type-small text-muted-foreground">{label('noOwnedOrganisations')}</p>
          )}
        </SettingsDanger>
      </SettingsParts>

      <TypedConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        objectName={email ?? ''}
        title={label('deleteAccount')}
        confirmLabel={label('deleteAccount')}
        description={label('deleteAccountDialog')}
        onConfirm={deleteAccount}
        locale={locale}
      />
    </div>
  )
}

export default AccountDataPanel
