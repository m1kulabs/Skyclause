'use client'

import { useState } from 'react'
import { Button } from '#ui/button'
import { TypedConfirmDialog } from '../settings/set-7/confirm-dialog'
import { useUndoableAction } from '../settings/set-7/use-undoable-action'
import { OperationError } from '../subscribe/error'
import { apiFetch } from '../subscribe/operations'
import { actionClass } from '../subscribe/fields'
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
    <div className="grid gap-2">
      <Button
        className={`${actionClass} text-destructive`}
        variant="outline"
        disabled={removal.pending || removal.committing}
        onClick={() => setOpen(true)}
      >
        {t('subscribers.remove', { name: email }, locale)}
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
        <div role="status">
          <p>{t('subscribers.pending', { name: email }, locale)}</p>
          <Button className={actionClass} onClick={removal.undo}>
            {t('subscribers.undo', {}, locale)}
          </Button>
        </div>
      )}
      <OperationError error={removal.error} locale={locale} />
    </div>
  )
}
