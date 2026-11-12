'use client'

import { useState } from 'react'
import { Button } from '#ui/button'
import { TypedConfirmDialog } from '../settings/set-7/confirm-dialog'
import { useUndoableAction } from '../settings/set-7/use-undoable-action'
import { OperationError } from '../subscribe/error'
import { apiFetch } from '../subscribe/operations'
import { t } from './catalogue'

export function RemoveSubscriber({
  id,
  email,
  locale,
  onRemoved
}: {
  id: string
  email: string
  locale: 'en' | 'ms'
  onRemoved: () => void
}) {
  const [open, setOpen] = useState(false)
  const removal = useUndoableAction(async ({ keepalive }) => {
    await apiFetch('deleteSubscriber', { params: { id }, keepalive })
    onRemoved()
  })
  return (
    <div className="grid justify-items-start gap-2">
      <Button
        variant="outline"
        size="sm"
        className="pointer-coarse:h-11"
        aria-label={t('subscribers.remove', { name: email }, locale)}
        disabled={removal.pending || removal.committing}
        onClick={() => setOpen(true)}
      >
        {t('subscribers.remove_short', {}, locale)}
      </Button>
      <TypedConfirmDialog
        open={open}
        onOpenChange={setOpen}
        objectName={email}
        title={t('subscribers.remove_title', { name: email }, locale)}
        confirmLabel={t('subscribers.remove_title', { name: email }, locale)}
        description={t('subscribers.remove_description', {}, locale)}
        locale={locale}
        onConfirm={() => {
          removal.start()
        }}
      />
      {removal.pending && (
        <div role="status" className="type-small grid justify-items-start gap-2">
          <p>{t('subscribers.pending', { name: email }, locale)}</p>
          <Button variant="outline" size="sm" onClick={removal.undo}>
            {t('subscribers.undo', {}, locale)}
          </Button>
        </div>
      )}
      <OperationError error={removal.error} locale={locale} />
    </div>
  )
}
