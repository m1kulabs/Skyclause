import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter
} from '#ui/alert-dialog'
import { Button } from '#ui/button'
import type { Conflict } from './operations'
import { inputText } from './input-fact'
import { t } from './i18n'

export function RecheckDialog({
  conflict,
  pending,
  onCancel,
  onConfirm
}: {
  conflict: Conflict
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onCancel()
      }}
    >
      <AlertDialogContent className="bundle-recheck">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('bundles.changed')}</AlertDialogTitle>
          <AlertDialogDescription>{t('bundles.changed_help')}</AlertDialogDescription>
        </AlertDialogHeader>
        <div>
          {conflict.changed_inputs?.map((change, index) => (
            <div key={index}>
              <p>{t('bundles.call', { id: change.call_id })}</p>
              <p>{t('bundles.before', { value: inputText(change.before) })}</p>
              <p>{t('bundles.after', { value: inputText(change.after) })}</p>
            </div>
          ))}
          {conflict.changed_verdicts?.map((change, index) => (
            <div key={index}>
              <p>{t('bundles.call', { id: change.call_id })}</p>
              <p>{t('bundles.before', { value: t(`bundles.modes.${change.before.mode ?? 'no_call'}`) })}</p>
              <p>{t('bundles.after', { value: t(`bundles.modes.${change.after.mode ?? 'no_call'}`) })}</p>
            </div>
          ))}
        </div>
        <AlertDialogFooter>
          <Button disabled={pending} variant="outline" onClick={onCancel}>
            {t('bundles.cancel')}
          </Button>
          <Button disabled={pending} onClick={onConfirm}>
            {t(pending ? 'bundles.pending' : 'bundles.confirm')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
