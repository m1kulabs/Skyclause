'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { Field, FieldLabel, FieldGroup, FieldError, FieldDescription } from '#ui/field'
import { Input } from '#ui/input'
import { Button } from '#ui/button'
import { Alert, AlertDescription } from '#ui/alert'
import { useUnsavedChangesGuard } from '../settings/set-7'
import { ApiProblem } from '../../lib/api-fetch'
import { addDays, localDate, validateWindow, windowBody, type WindowDraft, type FieldErrors } from './model'
import { windowsApi, type WindowView } from './operations'
import { RecurrenceFields } from './recurrence-fields'
import { t, fieldMessage, type Locale } from './catalogue'
import { problemFields } from './validation'
import { selectClass } from './recurrence-fields'

/** What each field accepts, printed under it and tied to it for a screen reader. */
const describedBy = (id: string, error: string | undefined) => `${id}-hint${error ? ` ${id}-error` : ''}`

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
  registerClose,
  locale
}: {
  locale: Locale
  projectId: string
  window?: WindowView
  root: string
  onSaved: (saved: WindowView) => void
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
      className="flex flex-col gap-5"
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
          const saved = window
            ? await windowsApi('updateWindow', {
                params: { id: window.id },
                query: window.series_id ? { scope } : undefined,
                body: windowBody({ ...draft, repeat: scope === 'series' && draft.repeat })
              })
            : await windowsApi('createWindow', { params: { id: projectId }, body: windowBody(draft) })
          setDirty(false)
          onSaved(saved)
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
          <FieldLabel htmlFor="window-title">{t('windows.field_title', {}, locale)}</FieldLabel>
          <Input
            id="window-title"
            name="title"
            autoComplete="off"
            maxLength={200}
            value={draft.title}
            onChange={(event) => change('title', event.target.value)}
            aria-invalid={!!errors.title}
            aria-describedby={describedBy('window-title', errors.title)}
          />
          <FieldDescription id="window-title-hint">{t('windows.limit_title', {}, locale)}</FieldDescription>
          {errors.title && <FieldError id="window-title-error">{fieldMessage(errors.title!, locale)}</FieldError>}
        </Field>
        <Field data-invalid={!!errors.kind}>
          <FieldLabel htmlFor="window-kind">{t('windows.kind', {}, locale)}</FieldLabel>
          <select
            id="window-kind"
            name="kind"
            autoComplete="off"
            className={selectClass}
            value={draft.kind}
            onChange={(event) => change('kind', event.target.value as WindowDraft['kind'])}
            aria-invalid={!!errors.kind}
            aria-describedby={describedBy('window-kind', errors.kind)}
          >
            {(['class', 'event', 'commute_wave'] as const).map((kind) => (
              <option key={kind} value={kind}>
                {t(`windows.${kind}`, {}, locale)}
              </option>
            ))}
          </select>
          <FieldDescription id="window-kind-hint">{t('windows.limit_kind', {}, locale)}</FieldDescription>
          {errors.kind && <FieldError id="window-kind-error">{fieldMessage(errors.kind!, locale)}</FieldError>}
        </Field>
        <Field data-invalid={!!errors.date}>
          <FieldLabel htmlFor="window-date">{t('windows.date', {}, locale)}</FieldLabel>
          <Input
            id="window-date"
            name="date"
            type="date"
            autoComplete="off"
            min={localDate()}
            max={addDays(localDate(), 90)}
            value={draft.date}
            onChange={(event) => change('date', event.target.value)}
            aria-invalid={!!errors.date}
            aria-describedby={describedBy('window-date', errors.date)}
          />
          <FieldDescription id="window-date-hint">{t('windows.limit_date', {}, locale)}</FieldDescription>
          {errors.date && <FieldError id="window-date-error">{fieldMessage(errors.date!, locale)}</FieldError>}
        </Field>
        <div className="grid grid-cols-2 gap-x-3 gap-y-5">
          {(['start', 'end'] as const).map((field) => (
            <Field key={field} data-invalid={!!errors[field]}>
              <FieldLabel htmlFor={`window-${field}`}>{t(`windows.${field}`, {}, locale)}</FieldLabel>
              <Input
                id={`window-${field}`}
                name={field}
                type="time"
                autoComplete="off"
                data-numeric
                value={draft[field]}
                onChange={(event) => change(field, event.target.value)}
                aria-invalid={!!errors[field]}
                aria-describedby={describedBy(`window-${field}`, errors[field])}
              />
              <FieldDescription id={`window-${field}-hint`}>{t(`windows.limit_${field}`, {}, locale)}</FieldDescription>
              {errors[field] && (
                <FieldError id={`window-${field}-error`}>
                  {fieldMessage(errors[field]!, locale)}
                  {errors[field] === 'past' && (
                    <a className="ml-1 underline underline-offset-3" href={`${root}/ledger?tab=evidence`}>
                      {t('windows.evidence', {}, locale)}
                    </a>
                  )}
                </FieldError>
              )}
            </Field>
          ))}
        </div>
        {window?.series_id && (
          <Field>
            <FieldLabel htmlFor="window-scope">{t('windows.scope', {}, locale)}</FieldLabel>
            <select
              id="window-scope"
              name="scope"
              autoComplete="off"
              className={selectClass}
              value={scope}
              onChange={(event) => {
                setScope(event.target.value === 'series' ? 'series' : 'occurrence')
              }}
            >
              <option value="occurrence">{t('windows.occurrence', {}, locale)}</option>
              <option value="series">{t('windows.whole_series', {}, locale)}</option>
            </select>
          </Field>
        )}
        {(!window || scope === 'series') && (
          <RecurrenceFields draft={draft} change={change} errors={errors} locale={locale} />
        )}
      </FieldGroup>
      {failed && (
        <Alert variant="destructive">
          <AlertDescription>{t('windows.save_error', {}, locale)}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="max-sm:w-full" disabled={saving}>
          {t(saving ? 'windows.saving' : 'windows.save', {}, locale)}
        </Button>
        {window && (
          <Button
            type="button"
            data-window-cancel
            variant="outline"
            className="max-sm:w-full"
            disabled={saving}
            onClick={() => {
              if (guardNavigation(() => {})) {
                onCancel(scope)
              }
            }}
          >
            {t('windows.cancel', {}, locale)}
          </Button>
        )}
      </div>
      <p role="status">{saving ? t('windows.saving', {}, locale) : ''}</p>
    </form>
  )
}
