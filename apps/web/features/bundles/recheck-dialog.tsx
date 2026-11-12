import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter
} from '#ui/alert-dialog'
import { Button } from '#ui/button'
import type { CallDetail, Conflict } from './operations'
import { inputText } from './input-fact'
import { callName } from './call-review'
import { t, type Locale } from './i18n'

export function RecheckDialog({
  conflict,
  calls,
  pending,
  onCancel,
  onConfirm,
  locale = 'en'
}: {
  conflict: Conflict
  /** The bundle's calls, so each change is named by its window, never by its ID. */
  calls: CallDetail[]
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
  locale?: Locale
}) {
  const name = (id: string) => {
    const call = calls.find((item) => item.id === id)
    return call ? callName(call, locale) : t('bundles.site_call', {}, locale)
  }
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onCancel()
      }}
    >
      <AlertDialogContent className="bundle-recheck">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('bundles.changed', {}, locale)}</AlertDialogTitle>
          <AlertDialogDescription>{t('bundles.changed_help', {}, locale)}</AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="bundle-recheck-changes">
          {conflict.changed_inputs?.map((change, index) => (
            <li key={`input-${index}`}>
              <p className="bundle-recheck-call">{name(change.call_id)}</p>
              <p>{t('bundles.before', { value: inputText(change.before, locale) }, locale)}</p>
              <p>{t('bundles.after', { value: inputText(change.after, locale) }, locale)}</p>
            </li>
          ))}
          {conflict.changed_verdicts?.map((change, index) => (
            <li key={`verdict-${index}`}>
              <p className="bundle-recheck-call">{name(change.call_id)}</p>
              <p>
                {t(
                  'bundles.before',
                  { value: t(`bundles.modes.${change.before.mode ?? 'no_call'}`, {}, locale) },
                  locale
                )}
              </p>
              <p>
                {t(
                  'bundles.after',
                  { value: t(`bundles.modes.${change.after.mode ?? 'no_call'}`, {}, locale) },
                  locale
                )}
              </p>
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <Button disabled={pending} variant="outline" onClick={onCancel}>
            {t('bundles.cancel', {}, locale)}
          </Button>
          <Button disabled={pending} onClick={onConfirm}>
            {t(pending ? 'bundles.pending' : 'bundles.confirm', {}, locale)}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
