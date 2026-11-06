'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { t } from './catalogue'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '#ui/alert-dialog'
import { Input } from '#ui/input'
import { Label } from '#ui/label'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  objectName: string
  /** Pass complete translated phrases; interpolate the object's name in each. */
  title: string
  confirmLabel: string
  description: string
  onConfirm: () => void | Promise<void>
  locale?: 'en' | 'ms'
}

function Confirmation({
  open,
  onOpenChange,
  objectName,
  title,
  confirmLabel,
  description,
  onConfirm,
  locale = 'en',
  typed = false
}: ConfirmDialogProps & { typed?: boolean }) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const inFlight = useRef(false)
  const fieldId = useId()
  const errorId = useId()
  const cancel = useRef<HTMLButtonElement | null>(null)
  const enabled = !typed || (objectName.length > 0 && value === objectName)
  const objectLabel = t('set7.object', { name: objectName }, locale)

  useEffect(() => {
    if (!open) {
      setValue('')
      setFailed(false)
    }
  }, [open])

  const confirm = async () => {
    if (!enabled || inFlight.current) return
    inFlight.current = true
    setSaving(true)
    setFailed(false)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch {
      setFailed(true)
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !inFlight.current && onOpenChange(next)}>
      <AlertDialogContent
        className="max-h-[90svh] max-w-[calc(100%-2rem)] overflow-y-auto break-words sm:max-w-md"
        initialFocus={cancel}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="min-w-0 [overflow-wrap:anywhere]">
            {title.includes(`“${objectName}”`)
              ? title
              : t('set7.named_action', { action: title, name: objectName }, locale)}
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {typed && (
          <div className="grid min-w-0 gap-2">
            <Label htmlFor={fieldId} className="block leading-5 [overflow-wrap:anywhere]">
              {t('set7.type_name', { name: objectName }, locale)}
            </Label>
            <Input
              id={fieldId}
              name="confirmation-name"
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="none"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              disabled={saving}
            />
          </div>
        )}
        {failed && (
          <p id={errorId} role="alert" className="text-destructive">
            {t('set7.confirm_failed', {}, locale)}
          </p>
        )}
        <AlertDialogFooter className="min-w-0 sm:flex-wrap">
          <AlertDialogCancel ref={cancel} disabled={saving} className="h-auto min-h-11 whitespace-normal">
            {t('set7.cancel', {}, locale)}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!enabled || saving}
            aria-describedby={failed ? errorId : undefined}
            aria-busy={saving}
            className="h-auto min-h-11 min-w-0 whitespace-normal [overflow-wrap:anywhere]"
            onClick={confirm}
          >
            {saving
              ? t('set7.saving', {}, locale)
              : confirmLabel.includes(`“${objectName}”`)
                ? confirmLabel
                : t('set7.named_action', { action: confirmLabel, name: objectName }, locale)}
          </AlertDialogAction>
        </AlertDialogFooter>
        <span className="sr-only">{objectLabel}</span>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  return <Confirmation key={props.objectName} {...props} />
}

export function TypedConfirmDialog(props: ConfirmDialogProps) {
  return <Confirmation key={props.objectName} {...props} typed />
}
