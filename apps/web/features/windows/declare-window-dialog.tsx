'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '#ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '#ui/sheet'
import { Skeleton } from '#ui/skeleton'
import { Button } from '#ui/button'
import { ToggleGroup, ToggleGroupItem } from '#ui/toggle-group'
import { useUndoableAction } from '../settings/set-7'
import { ApiProblem } from '../../lib/api-fetch'
import { SourceError } from '../data-components'
import { allPages, resolveProject, windowsApi, type WindowView } from './operations'
import { WindowForm } from './window-form'
import { ImportForm } from './import-form'
import { useMedia } from './use-media'
import { localDate } from './model'
import { t } from './catalogue'

export interface DeclareWindowDialogProps {
  org: string
  project: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/** A dialog on a desktop, and on a phone a sheet that rises from the bottom edge (both are one Base UI dialog). */
function Frame({
  phone,
  open,
  onClose,
  title,
  description,
  children
}: {
  phone: boolean
  open: boolean
  onClose: () => void
  title: string
  description: string
  children: ReactNode
}) {
  const onOpenChange = (next: boolean) => {
    if (!next) onClose()
  }
  if (phone)
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          data-window-sheet
          className="max-h-[calc(100svh-16px)] overflow-y-auto pb-[max(20px,env(safe-area-inset-bottom))]"
        >
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-5 px-5">{children}</div>
        </SheetContent>
      </Sheet>
    )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-window-dialog className="max-h-[calc(100svh-3rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

export function DeclareWindowDialog({ org, project, open, onOpenChange }: DeclareWindowDialogProps) {
  const search = useSearchParams()
  const router = useRouter()
  const editId = search.get('edit')
  const visible = open ?? (search.get('declare') === 'window' || !!editId)
  const importing = !editId && search.get('import') === 'ics'
  const root = `/${encodeURIComponent(org)}/${encodeURIComponent(project)}`
  const guard = useRef<() => boolean>(() => true)
  const queued = useRef<{ id: string; scope: 'occurrence' | 'series' } | null>(null)
  const [status, setStatus] = useState('')
  const [loaded, setLoaded] = useState<{ projectId: string; window?: WindowView; key: string }>()
  const [loadError, setLoadError] = useState<{ status: number | null; at: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const phone = useMedia('(max-width: 640px)')
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

  function close(force = false) {
    if (!force && !guard.current()) return
    onOpenChange?.(false)
    const next = new URLSearchParams(search)
    for (const key of ['declare', 'edit', 'import']) next.delete(key)
    router.replace(`?${next}`, { scroll: false })
    setLoaded(undefined)
    guard.current = () => true
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-declare-window]')?.focus())
  }
  function saved(created?: WindowView) {
    setStatus(importing ? 'imported' : 'saved')
    close(true)
    window.dispatchEvent(
      new CustomEvent('windows:changed', {
        detail: created ? { id: created.id, date: localDate(created.starts_at) } : undefined
      })
    )
  }
  return (
    <>
      <Frame
        phone={phone}
        open={visible}
        onClose={() => close()}
        title={t(editId ? 'windows.edit' : 'windows.declare')}
        description={t('windows.description')}
      >
        {!editId && (
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
            aria-label={t('windows.details')}
          >
            <ToggleGroupItem value="manual">{t('windows.manual')}</ToggleGroupItem>
            <ToggleGroupItem value="ics">{t('windows.import')}</ToggleGroupItem>
          </ToggleGroup>
        )}
        {loadError ? (
          <SourceError
            source={t('windows.source_window')}
            status={loadError.status}
            at={loadError.at}
            retry={
              <Button
                variant="outline"
                onClick={() => {
                  setLoadError(null)
                  setAttempt((value) => value + 1)
                }}
              >
                {t('windows.retry')}
              </Button>
            }
          />
        ) : loaded?.key === key ? (
          importing ? (
            <ImportForm
              key={`${key}-import`}
              projectId={loaded.projectId}
              onSaved={() => saved()}
              registerClose={(check) => {
                guard.current = check
              }}
            />
          ) : (
            <WindowForm
              key={key}
              projectId={loaded.projectId}
              window={loaded.window}
              root={root}
              onSaved={saved}
              registerClose={(check) => {
                guard.current = check
              }}
              onCancel={(scope) => {
                if (action.pending || action.committing || !loaded.window) return
                queued.current = { id: loaded.window.id, scope }
                action.start()
                setStatus('cancelled')
                close(true)
              }}
            />
          )
        ) : (
          <div className="flex flex-col gap-4" aria-busy="true">
            <p role="status" className="sr-only">
              {t('windows.loading')}
            </p>
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-2/3 rounded-md" />
          </div>
        )}
      </Frame>
      {(status || action.error) && status !== 'dismissed' && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-[max(16px,env(safe-area-inset-bottom))] z-50 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-popover p-4 text-popover-foreground shadow-lg sm:left-auto sm:w-96"
        >
          <p className="min-w-0 flex-1">{t(action.error ? 'windows.cancel_error' : `windows.${status}`)}</p>
          {action.pending && (
            <Button
              data-window-undo
              variant="outline"
              onClick={() => {
                action.undo()
                setStatus('undone')
              }}
            >
              {t('windows.undo')}
            </Button>
          )}
          {!action.pending && !action.committing && (
            <Button variant="ghost" onClick={() => setStatus('dismissed')}>
              {t('windows.close')}
            </Button>
          )}
        </div>
      )}
    </>
  )
}
