'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { Field, FieldLabel, FieldGroup, FieldError } from '#ui/field'
import { Input } from '#ui/input'
import { Button } from '#ui/button'
import { Alert, AlertDescription } from '#ui/alert'
import { useUnsavedChangesGuard } from '../settings/set-7'
import { ApiProblem } from '../../lib/api-fetch'
import { localDate, validateWindow, windowBody, type WindowDraft, type FieldErrors } from './model'
import { windowsApi, type WindowView } from './operations'
import { RecurrenceFields } from './recurrence-fields'
import { t, fieldMessage } from './catalogue'
import { problemFields } from './validation'
import styles from './windows.module.css'

function timeInput(instant: string) {
  return new Date(Date.parse(instant) + 8 * 3_600_000).toISOString().slice(11, 16)
}
function initialDraft(window?: WindowView): WindowDraft {
  const recurrence = window?.recurrence
  return {
    title: window?.title ?? '',
    kind: window?.kind ?? 'class',
    date: window ? localDate(window.starts_at) : localDate(),
    start: window ? timeInput(window.starts_at) : '',
    end: window ? timeInput(window.ends_at) : '',
    repeat: !!recurrence,
    days: recurrence?.days_of_week ?? [],
    repeatEnd: recurrence?.count ? 'count' : 'until',
    until: recurrence?.until ?? '',
    count: recurrence?.count ? String(recurrence.count) : '',
    skips: recurrence?.skip_dates.join(', ') ?? ''
  }
}

export function WindowForm({
  projectId,
  window,
  root,
  onSaved,
  onCancel,
  registerClose
}: {
  projectId: string
  window?: WindowView
  root: string
  onSaved: () => void
  onCancel: (scope: 'occurrence' | 'series') => void
  registerClose: (close: () => boolean) => void
}) {
  const [draft, setDraft] = useState(() => initialDraft(window))
  const [scope, setScope] = useState<'occurrence' | 'series'>('occurrence')
  const [dirty, setDirty] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const focusRequested = useRef(false)
  useLayoutEffect(() => {
    if (!focusRequested.current) return
    document.querySelector<HTMLElement>('[data-window-form] [aria-invalid="true"]')?.focus()
    focusRequested.current = false
  }, [errors])
  const { guardNavigation } = useUnsavedChangesGuard(dirty)
  // The host's Escape, backdrop and close button all use the same SET-7 guard.
  registerClose(() => !saving && guardNavigation(() => {}))
  function change<Key extends keyof WindowDraft>(key: Key, value: WindowDraft[Key]) {
    const nextDraft = { ...draft, [key]: value }
    setDraft(nextDraft)
    setDirty(true)
    const validation = validateWindow({ ...nextDraft, repeat: (!window || scope === 'series') && nextDraft.repeat })
    setErrors((previous) => {
      const next = { ...previous, [key]: validation[key] }
      if (['date', 'start', 'kind'].includes(key) && nextDraft.start && nextDraft.end) next.end = validation.end
      return next
    })
  }
  function focusError(next: FieldErrors) {
    focusRequested.current = true
    setErrors(next)
  }
  return (
    <form
      className={styles.form}
      data-window-form
      noValidate
      onSubmit={async (event) => {
        event.preventDefault()
        if (saving) return
        const next = validateWindow({ ...draft, repeat: (!window || scope === 'series') && draft.repeat })
        if (Object.keys(next).length) {
          focusError(next)
          return
        }
        setSaving(true)
        setFailed(false)
        setErrors({})
        try {
          if (window)
            await windowsApi('updateWindow', {
              params: { id: window.id },
              query: window.series_id ? { scope } : undefined,
              body: windowBody({ ...draft, repeat: scope === 'series' && draft.repeat })
            })
          else await windowsApi('createWindow', { params: { id: projectId }, body: windowBody(draft) })
          setDirty(false)
          onSaved()
        } catch (error) {
          if (error instanceof ApiProblem && error.status === 422) focusError(problemFields(error.body.errors))
          setFailed(true)
        } finally {
          setSaving(false)
        }
      }}
    >
      <FieldGroup inert={saving}>
        <Field data-invalid={!!errors.title}>
          <FieldLabel htmlFor="window-title">{t('windows.field_title')}</FieldLabel>
          <Input
            id="window-title"
            name="title"
            autoComplete="off"
            maxLength={200}
            value={draft.title}
            onChange={(event) => change('title', event.target.value)}
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? 'window-title-error' : undefined}
          />
          {errors.title && <FieldError id="window-title-error">{fieldMessage(errors.title!)}</FieldError>}
        </Field>
        <Field data-invalid={!!errors.kind}>
          <FieldLabel htmlFor="window-kind">{t('windows.kind')}</FieldLabel>
          <select
            id="window-kind"
            name="kind"
            value={draft.kind}
            onChange={(event) => change('kind', event.target.value as WindowDraft['kind'])}
            aria-invalid={!!errors.kind}
            aria-describedby={errors.kind ? 'window-kind-error' : undefined}
          >
            {(['class', 'event', 'commute_wave'] as const).map((kind) => (
              <option key={kind} value={kind}>
                {t(`windows.${kind}`)}
              </option>
            ))}
          </select>
          {errors.kind && <FieldError id="window-kind-error">{fieldMessage(errors.kind!)}</FieldError>}
        </Field>
        {(['date', 'start', 'end'] as const).map((field) => (
          <Field key={field} data-invalid={!!errors[field]}>
            <FieldLabel htmlFor={`window-${field}`}>{t(`windows.${field}`)}</FieldLabel>
            <Input
              id={`window-${field}`}
              name={field}
              type={field === 'date' ? 'date' : 'time'}
              autoComplete="off"
              value={draft[field]}
              onChange={(event) => change(field, event.target.value)}
              aria-invalid={!!errors[field]}
              aria-describedby={errors[field] ? `window-${field}-error` : undefined}
            />
            {errors[field] && (
              <FieldError id={`window-${field}-error`}>
                {fieldMessage(errors[field]!)}
                {errors[field] === 'past' && <a href={`${root}/ledger?request=evidence`}>{t('windows.evidence')}</a>}
              </FieldError>
            )}
          </Field>
        ))}
        {window?.series_id && (
          <Field>
            <FieldLabel htmlFor="window-scope">{t('windows.scope')}</FieldLabel>
            <select
              id="window-scope"
              name="scope"
              value={scope}
              onChange={(event) => {
                setScope(event.target.value === 'series' ? 'series' : 'occurrence')
              }}
            >
              <option value="occurrence">{t('windows.occurrence')}</option>
              <option value="series">{t('windows.whole_series')}</option>
            </select>
          </Field>
        )}
        {(!window || scope === 'series') && <RecurrenceFields draft={draft} change={change} errors={errors} />}
      </FieldGroup>
      {failed && (
        <Alert variant="destructive">
          <AlertDescription>{t('windows.save_error')}</AlertDescription>
        </Alert>
      )}
      <div className={styles.formActions}>
        <Button type="submit" disabled={saving}>
          {t(saving ? 'windows.saving' : 'windows.save')}
        </Button>
        {window && (
          <Button
            type="button"
            data-window-cancel
            variant="outline"
            disabled={saving}
            onClick={() => {
              if (guardNavigation(() => {})) {
                onCancel(scope)
              }
            }}
          >
            {t('windows.cancel')}
          </Button>
        )}
      </div>
      <p role="status">{saving ? t('windows.saving') : ''}</p>
    </form>
  )
}
