'use client'

import { useState } from 'react'
import { Button } from '#ui/button'
import { TypedConfirmDialog } from '../settings/set-7/confirm-dialog'
import { useUndoableAction } from '../settings/set-7/use-undoable-action'
import { OperationError } from '../subscribe/error'
import { apiFetch } from '../subscribe/operations'
import { t } from './catalogue'

export interface RemovalTarget {
  id: string
  email: string
}

/**
 * Removing a subscriber, for the whole list: a row's menu names the target (`request`), the dialog asks for the typed
 * email, the removal waits ten seconds and Undo stays in view until it is sent. One removal waits at a time, so the
 * list shows one notice rather than one per row; `node` is that notice and the dialog, and `busy` says a removal is
 * waiting or being sent.
 */
export function useSubscriberRemoval({ onRemoved, locale }: { onRemoved: () => void; locale: 'en' | 'ms' }) {
  const [target, setTarget] = useState<RemovalTarget | null>(null)
  // The queued target, kept apart from `target` so the dialog can close while the removal is still waiting.
  const [queued, setQueued] = useState<RemovalTarget | null>(null)
  // The action freezes this callback when the removal is queued, while `target` is still the confirmed subscriber.
  const removal = useUndoableAction(async ({ keepalive }) => {
    if (!target) return
    await apiFetch('deleteSubscriber', { params: { id: target.id }, keepalive })
    onRemoved()
  })
  const node = (
    <>
      {target ? (
        <TypedConfirmDialog
          open
          onOpenChange={(open) => !open && setTarget(null)}
          objectName={target.email}
          title={t('subscribers.remove_title', { name: target.email }, locale)}
          confirmLabel={t('subscribers.remove_title', { name: target.email }, locale)}
          description={t('subscribers.remove_description', {}, locale)}
          locale={locale}
          onConfirm={() => {
            setQueued(target)
            removal.start()
          }}
        />
      ) : null}
      <div role="status" className="type-small grid justify-items-start gap-2 empty:hidden">
        {removal.pending && queued ? (
          <>
            <p className="m-0">{t('subscribers.pending', { name: queued.email }, locale)}</p>
            <Button variant="outline" size="sm" className="pointer-coarse:h-11" onClick={removal.undo}>
              {t('subscribers.undo', {}, locale)}
            </Button>
          </>
        ) : null}
      </div>
      <OperationError error={removal.error} locale={locale} />
    </>
  )
  return { request: setTarget, busy: removal.pending || removal.committing, node }
}
