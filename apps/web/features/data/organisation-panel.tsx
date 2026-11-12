'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Role } from '@skyclause/contracts'
import { t } from '@skyclause/i18n'
import { Button } from '../../components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table'
import {
  SettingsAside,
  SettingsDanger,
  SettingsError,
  SettingsPart,
  SettingsParts,
  SettingsStatus,
  SettingsSummaryLine
} from '../settings/parts'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '../../components/ui/alert-dialog'
import { TypedConfirmDialog } from '../settings/set-7/confirm-dialog'
import '../settings/catalogue'
import { retentionRows } from './retention-catalogue'
import { ExportList } from './export-list'
import { organisationApiFetch, type DeletionState, type OrganisationExport } from './operations'
import { formatExpiryDate, problemSlug } from './model'

export function OrganisationDataPanel({
  org,
  role,
  locale = 'en'
}: {
  org: string
  role: Role | undefined
  locale?: 'en' | 'ms'
}) {
  const [exports, setExports] = useState<OrganisationExport[]>([])
  const [exportCursor, setExportCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [deletion, setDeletion] = useState<DeletionState>({ deletion_requested_at: null, purge_after: null })
  const [loading, setLoading] = useState(true)
  const [exportError, setExportError] = useState('')
  const [pageError, setPageError] = useState('')
  const [cancelError, setCancelError] = useState('')
  const [requested, setRequested] = useState(false)
  const [offerOpen, setOfferOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [scheduled, setScheduled] = useState('')
  const [cancelled, setCancelled] = useState(false)
  const owner = role === 'owner'
  const label = useCallback(
    (key: string, vars: Record<string, string | number> = {}) => t(`settings.data.${key}`, vars, locale),
    [locale]
  )

  const loadExports = useCallback(
    async (cursor?: string | null) => {
      const page = await organisationApiFetch('listOrganisationExports', {
        params: { org },
        query: { limit: 50, cursor: cursor ?? undefined }
      })
      setExports((current) => {
        const incoming = new Set(page.data.map((job) => job.id))
        return cursor
          ? [...current.filter((job) => !incoming.has(job.id)), ...page.data]
          : [...page.data, ...current.filter((job) => !incoming.has(job.id))]
      })
      setExportCursor(page.next_cursor)
    },
    [org]
  )

  const loadDeletion = useCallback(async () => {
    const state = await organisationApiFetch('getOrganisationDeletion', { params: { org } })
    setDeletion(state)
  }, [org])

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([
      loadExports().catch(() => active && setExportError(label('exportFailed'))),
      loadDeletion().catch(() => active && setPageError(label('deleteFailed')))
    ]).finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [label, loadDeletion, loadExports])

  useEffect(() => {
    if (!exports.some((job) => job.status === 'queued' || job.status === 'running')) return
    const timer = window.setInterval(() => {
      void loadExports().catch(() => setExportError(label('exportFailed')))
    }, 10_000)
    return () => window.clearInterval(timer)
  }, [exports, label, loadExports])

  const requestExport = async (continueToDelete = false) => {
    setExportError('')
    setRequested(false)
    try {
      const job = await organisationApiFetch('createOrganisationExport', {
        params: { org },
        body: { formats: ['json', 'csv'] }
      })
      setExports((current) => [job, ...current.filter((entry) => entry.id !== job.id)])
      setRequested(true)
      if (continueToDelete) {
        setOfferOpen(false)
        setConfirmOpen(true)
      }
    } catch (error) {
      const slug = problemSlug(error)
      setExportError(slug === 'export-pending' ? label('exportPending') : label('exportFailed'))
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

  // A failed cancel gets its own message, shown where the cancel is: the grace period is still running.
  const cancelDeletion = async () => {
    setPageError('')
    setCancelError('')
    try {
      const state = await organisationApiFetch('cancelOrganisationDeletion', { params: { org } })
      setDeletion(state)
      setScheduled('')
      setCancelled(true)
    } catch {
      setCancelError(label('cancelFailed'))
    }
  }

  const scheduleDeletion = async () => {
    setPageError('')
    try {
      const state = await organisationApiFetch('requestOrganisationDeletion', {
        params: { org },
        body: { slug: org }
      })
      setDeletion(state)
      setScheduled(state.purge_after ? formatExpiryDate(state.purge_after, locale) : '')
      setCancelled(false)
    } catch {
      setPageError(label('deleteFailed'))
      throw new Error('Organisation deletion request failed')
    }
  }

  const rows = retentionRows.map((row) => ({
    item: label(`retention.${row}.item`),
    period: label(`retention.${row}.period`),
    after: label(`retention.${row}.after`)
  }))

  return (
    <div aria-busy={loading}>
      <SettingsAside>
        <SettingsSummaryLine label={label('summaryExports')}>
          {loading ? label('loadingExports') : label('summaryExportCount', { count: exports.length })}
        </SettingsSummaryLine>
        <SettingsSummaryLine label={label('summaryDeletion')}>
          {deletion.purge_after
            ? label('purgeDate', { date: formatExpiryDate(deletion.purge_after, locale) })
            : label('deletionCancelled')}
        </SettingsSummaryLine>
      </SettingsAside>
      <SettingsParts>
        <SettingsPart title={label('exportsTitle')} description={label('exportsDescription')} id="org-exports-title">
          <p className="type-small text-muted-foreground">{label('readyWithin')}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" className="transition-none" onClick={() => void requestExport()} disabled={loading}>
              {label('requestExport')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="transition-none"
              onClick={() => void loadExports().catch(() => setExportError(label('exportFailed')))}
              disabled={loading}
            >
              {label('refreshExports')}
            </Button>
            {loading && <SettingsStatus>{label('loadingExports')}</SettingsStatus>}
            {requested && <SettingsStatus>{label('exportRequested')}</SettingsStatus>}
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

        <SettingsPart title={label('retentionTitle')} description={label('retentionDescription')} id="retention-title">
          <Table aria-label={label('retentionTitle')}>
            <TableHeader>
              <TableRow>
                <TableHead>{label('retentionItem')}</TableHead>
                <TableHead>{label('retentionPeriod')}</TableHead>
                <TableHead>{label('retentionAfter')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.item}>
                  <TableCell className="font-medium whitespace-normal">{row.item}</TableCell>
                  <TableCell className="whitespace-normal" phone="meta" label={label('retentionPeriod')}>
                    {row.period}
                  </TableCell>
                  <TableCell className="whitespace-normal" phone="meta" label={label('retentionAfter')}>
                    {row.after}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SettingsPart>

        <SettingsDanger
          id="delete-org-title"
          title={label('deleteOrgTitle')}
          description={
            <>
              <p>{label('deleteOrgDescription')}</p>
              <p>{label('deleteOrgConsequence')}</p>
            </>
          }
        >
          {deletion.deletion_requested_at && deletion.purge_after ? (
            <div className="grid justify-items-start gap-3">
              <p role="status" className="font-medium text-foreground">
                {label('graceTitle')}
              </p>
              <p className="text-foreground">
                {label('purgeDate', { date: formatExpiryDate(deletion.purge_after, locale) })}
              </p>
              <Button type="button" variant="outline" onClick={() => void cancelDeletion()}>
                {label('cancelDeletion')}
              </Button>
              {cancelError && <SettingsError>{cancelError}</SettingsError>}
            </div>
          ) : owner ? (
            <Button
              type="button"
              variant="destructive"
              className="transition-none"
              onClick={() => setOfferOpen(true)}
              disabled={loading}
            >
              {label('deleteOrgTitle')}
            </Button>
          ) : (
            <p className="type-body text-muted-foreground">{label('ownerOnly')}</p>
          )}
          {scheduled && <SettingsStatus>{label('deletionScheduled', { date: scheduled })}</SettingsStatus>}
          {cancelled && <SettingsStatus>{label('deletionCancelled')}</SettingsStatus>}
          {!deletion.deletion_requested_at && !scheduled && pageError && <SettingsError>{pageError}</SettingsError>}
        </SettingsDanger>
      </SettingsParts>

      <AlertDialog open={offerOpen} onOpenChange={setOfferOpen}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{label('deleteOrgTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{label('deleteOrgDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          {exportError && <SettingsError>{exportError}</SettingsError>}
          <AlertDialogFooter>
            <AlertDialogCancel>{label('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void requestExport(true)}>{label('exportFirst')}</AlertDialogAction>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setOfferOpen(false)
                setConfirmOpen(true)
              }}
            >
              {label('continueWithoutExport')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TypedConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        objectName={org}
        title={label('deleteOrgTitle')}
        confirmLabel={label('deleteOrgTitle')}
        description={label('deleteOrgDialog')}
        onConfirm={scheduleDeletion}
        locale={locale}
      />
    </div>
  )
}

export default OrganisationDataPanel
