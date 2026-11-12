'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '#ui/dialog'
import { Skeleton } from '#ui/skeleton'
import { Button } from '#ui/button'
import { ToggleGroup, ToggleGroupItem } from '#ui/toggle-group'
import { useUndoableAction } from '../settings/set-7'
import { ApiProblem } from '../../lib/api-fetch'
import { SourceError } from '../data-components'
import { allPages, resolveProject, windowsApi, type WindowView } from './operations'
import { WindowForm } from './window-form'
import { WindowDetails } from './window-details'
import { ImportForm } from './import-form'
import type { WindowControls } from './controls'
import { localDate } from './model'
import { t, type Locale } from './catalogue'

export interface DeclareWindowDialogProps {
  org: string
  locale?: Locale
  project: string
  /** Which parts can work, read on the server from the API's handlers: the rest is not offered. */
  controls: WindowControls
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * One Base UI dialog: centred on a desktop, and below 640px restyled by CSS alone as a sheet on the bottom edge. No
 * script picks the frame, so the first paint on a phone and a phone turned across 640px keep the form and its draft.
 */
function Frame({
  open,
  onClose,
  finalFocus,
  title,
  description,
  children
}: {
  open: boolean
  onClose: () => void
  /** Where focus goes once the dialog has closed. */
  finalFocus: () => HTMLElement | null
  title: string
  description: string
  children: ReactNode
}) {
  const onOpenChange = (next: boolean) => {
    if (!next) onClose()
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-window-dialog
        finalFocus={() => finalFocus() ?? true}
        className="max-h-[calc(100svh-3rem)] overflow-y-auto overscroll-contain sm:max-w-xl max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-h-[calc(100svh-16px)] max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:p-5 max-sm:pb-[max(20px,env(safe-area-inset-bottom))]"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

const declareButton = () => document.querySelector<HTMLButtonElement>('[data-declare-window]')

export function DeclareWindowDialog({
  org,
  project,
  controls,
  locale = 'en',
  open,
  onOpenChange
}: DeclareWindowDialogProps) {
  const search = useSearchParams()
  const router = useRouter()
  const editId = search.get('edit')
  const visible = open ?? (search.get('declare') === 'window' || !!editId)
  const importing = controls.importIcs && !editId && search.get('import') === 'ics'
  // Without updateWindow an existing window is shown as its details, never as a form whose Save can only fail.
  const readOnly = !!editId && !controls.edit
  const root = `/${encodeURIComponent(org)}/${encodeURIComponent(project)}`
  const guard = useRef<() => boolean>(() => true)
  const queued = useRef<{ id: string; scope: 'occurrence' | 'series' } | null>(null)
  const [status, setStatus] = useState('')
  const [loaded, setLoaded] = useState<{ projectId: string; window?: WindowView; key: string }>()
  const [loadError, setLoadError] = useState<{ status: number | null; at: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const undoButton = useRef<HTMLButtonElement>(null)
  const undoOffered = useRef(false)
  const key = `${org}/${project}/${editId ?? 'new'}`
  const action = useUndoableAction(async ({ keepalive }) => {
    if (!queued.current) return
    await windowsApi('cancelWindow', {
      params: { id: queued.current.id },
      query: { scope: queued.current.scope },
      keepalive
    })
    setStatus('cancel_complete')
    window.dispatchEvent(new Event('windows:changed'))
  })
  useEffect(() => {
    if (!visible) return
    const controller = new AbortController()
    async function load() {
      try {
        const resolved = await resolveProject(org, project, controller.signal)
        let edited: WindowView | undefined
        if (editId) {
          const windows = await allPages((cursor) =>
            windowsApi('listWindows', {
              params: { id: resolved.id },
              query: { limit: 200, cursor, ...{ include: 'calls' } },
              signal: controller.signal
            })
          )
          edited = windows.find((item) => item.id === editId)
          if (!edited || edited.cancelled_at) throw new Error('Window unavailable')
        }
        if (!controller.signal.aborted) {
          setLoaded({ projectId: resolved.id, window: edited, key })
          setLoadError(null)
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setLoadError({ status: error instanceof ApiProblem ? error.status : null, at: new Date().toISOString() })
      }
    }
    void load()
    return () => controller.abort()
  }, [visible, org, project, editId, key, attempt])
  // While a cancellation can be undone its Undo takes focus, so the keyboard reaches it within the delay; once it is
  // gone (undone or committed), focus goes back to Declare a window, unless it has already moved on.
  useEffect(() => {
    if (action.pending) {
      undoOffered.current = true
      const frame = requestAnimationFrame(() => undoButton.current?.focus())
      return () => cancelAnimationFrame(frame)
    }
    if (!undoOffered.current) return
    undoOffered.current = false
    const active = document.activeElement
    if (!active || active === document.body) declareButton()?.focus()
  }, [action.pending])

  function close(force = false) {
    if (!force && !guard.current()) return
    onOpenChange?.(false)
    const next = new URLSearchParams(search)
    for (const key of ['declare', 'edit', 'import']) next.delete(key)
    router.replace(`?${next}`, { scroll: false })
    setLoaded(undefined)
    guard.current = () => true
    requestAnimationFrame(() => (undoButton.current ?? declareButton())?.focus())
  }
  function declareNew() {
    const next = new URLSearchParams(search)
    next.delete('edit')
    next.set('declare', 'window')
    router.replace(`?${next}`, { scroll: false })
  }
  function cancel(scope: 'occurrence' | 'series') {
    if (action.pending || action.committing || !loaded?.window) return
    queued.current = { id: loaded.window.id, scope }
    action.start()
    setStatus('cancelled')
    close(true)
  }
  function saved(created?: WindowView) {
    setStatus(importing ? 'imported' : 'saved')
    close(true)
    window.dispatchEvent(
      new CustomEvent('windows:changed', {
        detail: created ? { id: created.id, date: localDate(created.starts_at) } : undefined
      })
    )
    // The first-run steps on the page read again, so the window step turns done and the rota step opens.
    window.dispatchEvent(new Event('onboarding:changed'))
  }
  return (
    <>
      <Frame
        open={visible}
        onClose={() => close()}
        finalFocus={() => undoButton.current ?? declareButton()}
        title={t(readOnly ? 'windows.details_title' : editId ? 'windows.edit' : 'windows.declare', {}, locale)}
        description={t(readOnly ? 'windows.read_only' : 'windows.description', {}, locale)}
      >
        {!editId && controls.importIcs && (
          <ToggleGroup
            value={[importing ? 'ics' : 'manual']}
            onValueChange={(values) => {
              if (!values[0] || !guard.current()) return
              const next = new URLSearchParams(search)
              if (values[0] === 'ics') next.set('import', 'ics')
              else next.delete('import')
              router.replace(`?${next}`, { scroll: false })
              guard.current = () => true
            }}
            aria-label={t('windows.details', {}, locale)}
          >
            <ToggleGroupItem value="manual">{t('windows.manual', {}, locale)}</ToggleGroupItem>
            <ToggleGroupItem value="ics">{t('windows.import', {}, locale)}</ToggleGroupItem>
          </ToggleGroup>
        )}
        {loadError ? (
          <SourceError
            source={t('windows.source_window', {}, locale)}
            status={loadError.status}
            at={loadError.at}
            locale={locale}
            retry={
              loadError.status === 501 ? undefined : (
                <Button
                  variant="outline"
                  onClick={() => {
                    setLoadError(null)
                    setAttempt((value) => value + 1)
                  }}
                >
                  {t('windows.retry', {}, locale)}
                </Button>
              )
            }
          />
        ) : loaded?.key === key ? (
          readOnly && loaded.window ? (
            <WindowDetails
              window={loaded.window}
              locale={locale}
              onDeclare={declareNew}
              onCancel={controls.cancel ? () => cancel('occurrence') : undefined}
            />
          ) : importing ? (
            <ImportForm
              key={`${key}-import`}
              locale={locale}
              projectId={loaded.projectId}
              onSaved={() => saved()}
              registerClose={(check) => {
                guard.current = check
              }}
            />
          ) : (
            <WindowForm
              key={key}
              locale={locale}
              projectId={loaded.projectId}
              window={loaded.window}
              root={root}
              repeat={controls.repeat}
              cancellable={controls.cancel}
              onSaved={saved}
              registerClose={(check) => {
                guard.current = check
              }}
              onCancel={cancel}
            />
          )
        ) : (
          <div className="flex flex-col gap-4" aria-busy="true">
            <p role="status" className="sr-only">
              {t('windows.loading', {}, locale)}
            </p>
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-2/3 rounded-md" />
          </div>
        )}
      </Frame>
      {/* Mounted before its message arrives, so a screen reader announces the saved or cancelled line. */}
      <div role="status">
        {Boolean(status || action.error) && status !== 'dismissed' && (
          <div className="fixed inset-x-4 bottom-[max(16px,env(safe-area-inset-bottom))] z-50 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-popover p-4 text-popover-foreground shadow-lg sm:left-auto sm:w-96">
            <p className="min-w-0 flex-1">
              {t(action.error ? 'windows.cancel_error' : `windows.${status}`, {}, locale)}
            </p>
            {action.pending && (
              <Button
                ref={undoButton}
                data-window-undo
                variant="outline"
                onClick={() => {
                  action.undo()
                  setStatus('undone')
                }}
              >
                {t('windows.undo', {}, locale)}
              </Button>
            )}
            {!action.pending && !action.committing && (
              <Button variant="ghost" onClick={() => setStatus('dismissed')}>
                {t('windows.close', {}, locale)}
              </Button>
            )}
          </div>
        )}
      </div>
    </>
  )
}
