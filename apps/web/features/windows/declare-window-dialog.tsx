'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '#ui/dialog'
import { Button } from '#ui/button'
import { ToggleGroup, ToggleGroupItem } from '#ui/toggle-group'
import { useUndoableAction } from '../settings/set-7'
import { allPages, resolveProject, windowsApi, type WindowView } from './operations'
import { WindowForm } from './window-form'
import { ImportForm } from './import-form'
import { t } from './catalogue'
import styles from './windows.module.css'

export interface DeclareWindowDialogProps {
  org: string
  project: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
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
  const [loadError, setLoadError] = useState(false)
  const [attempt, setAttempt] = useState(0)
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
          setLoadError(false)
        }
      } catch {
        if (!controller.signal.aborted) setLoadError(true)
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
  function saved() {
    setStatus(importing ? 'imported' : 'saved')
    close(true)
    window.dispatchEvent(new Event('windows:changed'))
  }
  return (
    <>
      <Dialog
        open={visible}
        onOpenChange={(next) => {
          if (!next) close()
        }}
      >
        <DialogContent className={styles.dialog} showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t(editId ? 'windows.edit' : 'windows.declare')}</DialogTitle>
            <DialogDescription>{t('windows.description')}</DialogDescription>
          </DialogHeader>
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
            <div role="alert">
              <p>{t('windows.load_error')}</p>
              <Button
                variant="outline"
                onClick={() => {
                  setLoadError(false)
                  setAttempt((value) => value + 1)
                }}
              >
                {t('windows.retry')}
              </Button>
            </div>
          ) : loaded?.key === key ? (
            importing ? (
              <ImportForm
                key={`${key}-import`}
                projectId={loaded.projectId}
                onSaved={saved}
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
            <p role="status">{t('windows.loading')}</p>
          )}
          <Button variant="ghost" type="button" onClick={() => close()}>
            {t('windows.close')}
          </Button>
        </DialogContent>
      </Dialog>
      {(status || action.error) && status !== 'dismissed' && (
        <div className={styles.status} role="status">
          <p>{t(action.error ? 'windows.cancel_error' : `windows.${status}`)}</p>
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
