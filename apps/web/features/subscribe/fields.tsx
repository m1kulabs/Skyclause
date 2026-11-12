import { useId, useState, type FocusEvent } from 'react'
import { CircleAlertIcon } from 'lucide-react'
import type { Subscriber, Window } from '@skyclause/contracts'
import { formatDateCompact, formatDateKey, formatTime } from '@skyclause/i18n/format'
import { Input } from '#ui/input'
import { t } from './catalogue'

export type SubscriberFields = Pick<Subscriber, 'email' | 'role' | 'window_ids' | 'channels' | 'language'>
export const noticeChannels = ['email', 'ics', 'webhook', 'in_app'] as const
export const controlClass =
  'min-h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 py-2 text-foreground'
export const actionClass = 'h-auto min-h-11 max-w-full whitespace-normal break-words px-4 py-2'

/** A window's span in MYT: the day, then each time with its zone, and the end's own day when it falls on another. */
function windowSpan(window: Window, locale: 'en' | 'ms') {
  const sameDay = formatDateKey(window.starts_at) === formatDateKey(window.ends_at)
  return sameDay
    ? t(
        'subscribe.window_span',
        {
          day: formatDateCompact(window.starts_at, locale),
          start: formatTime(window.starts_at, locale),
          end: formatTime(window.ends_at, locale)
        },
        locale
      )
    : t(
        'subscribe.window_span_days',
        {
          startDay: formatDateCompact(window.starts_at, locale),
          start: formatTime(window.starts_at, locale),
          endDay: formatDateCompact(window.ends_at, locale),
          end: formatTime(window.ends_at, locale)
        },
        locale
      )
}

type TextField = 'email' | 'role'

/** Why a typed email or role cannot be saved, or null when it can. */
function problemOf(field: TextField, input: HTMLInputElement): string | null {
  if (!input.value.trim()) return field === 'email' ? 'subscribe.email_required' : 'subscribe.role_required'
  if (field === 'email' && input.validity.typeMismatch) return 'subscribe.email_invalid'
  return null
}

/**
 * The subscriber's fields. Nothing here is disabled while a change saves, so focus stays where the reader left it; an
 * email or role that cannot be saved says why beside its field instead of being dropped.
 */
export function Fields({
  value,
  windows,
  preferences,
  locale,
  onChange,
  onCommit
}: {
  value: SubscriberFields
  windows: Window[]
  preferences: boolean
  locale: 'en' | 'ms'
  onChange: (patch: Partial<SubscriberFields>) => void
  onCommit?: (patch: Partial<SubscriberFields>) => void
}) {
  const id = useId()
  const [problems, setProblems] = useState<Partial<Record<TextField, string>>>({})
  const check = (field: TextField, input: HTMLInputElement) => {
    const problem = problemOf(field, input)
    setProblems((current) => ({ ...current, [field]: problem ?? undefined }))
    return problem
  }
  const textField = (field: TextField) => {
    const errorId = `${id}-${field}-error`
    const problem = problems[field]
    return {
      id: `${id}-${field}`,
      name: field,
      required: true,
      className: 'h-12 text-base md:text-base',
      value: value[field],
      'aria-invalid': problem ? true : undefined,
      'aria-describedby': problem ? errorId : undefined,
      onChange: (event: { target: HTMLInputElement }) => {
        onChange({ [field]: event.target.value })
        // A shown problem clears as soon as the value is fixed; a new one waits for the reader to leave the field.
        if (problem) check(field, event.target)
      },
      onBlur: (event: FocusEvent<HTMLInputElement>) => {
        if (!check(field, event.target)) onCommit?.({ [field]: event.target.value })
      }
    }
  }
  const problemLine = (field: TextField) =>
    problems[field] ? (
      <p className="auth-error" id={`${id}-${field}-error`} role="alert">
        <CircleAlertIcon aria-hidden="true" />
        {t(problems[field]!, {}, locale)}
      </p>
    ) : null
  const toggle = <T extends string>(values: T[], item: T) =>
    values.includes(item) ? values.filter((v) => v !== item) : [...values, item]
  const change = (patch: Partial<SubscriberFields>) => {
    onChange(patch)
    onCommit?.(patch)
  }
  return (
    <fieldset className="auth-fields">
      <div className="auth-field">
        <label htmlFor={`${id}-email`}>{t('subscribe.email', {}, locale)}</label>
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          {...textField('email')}
        />
        {problemLine('email')}
      </div>
      <div className="auth-field">
        <label htmlFor={`${id}-role`}>{t('subscribe.role', {}, locale)}</label>
        <Input autoComplete="organization-title" {...textField('role')} />
        {problemLine('role')}
      </div>
      <fieldset className="auth-fieldset">
        <legend className="auth-legend">{t('subscribe.windows', {}, locale)}</legend>
        {!windows.length && <p className="auth-hint">{t('subscribe.no_windows', {}, locale)}</p>}
        {windows.map((window) => (
          <label key={window.id} className="auth-check auth-window">
            <input
              className="native-check"
              type="checkbox"
              name="window_ids"
              value={window.id}
              checked={value.window_ids.includes(window.id)}
              onChange={() => change({ window_ids: toggle(value.window_ids, window.id) })}
            />
            <span className="auth-window-title">{window.title}</span>
            <span className="auth-window-span">{windowSpan(window, locale)}</span>
          </label>
        ))}
      </fieldset>
      {preferences && (
        <fieldset className="auth-fieldset">
          <legend className="auth-legend">{t('subscribe.channels', {}, locale)}</legend>
          {noticeChannels.map((channel) => (
            <label key={channel} className="auth-check">
              <input
                className="native-check"
                type="checkbox"
                name="channels"
                value={channel}
                checked={value.channels.includes(channel)}
                onChange={() => change({ channels: toggle(value.channels, channel) })}
              />
              <span>{t(`subscribe.${channel}_channel`, {}, locale)}</span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="auth-field">
        <label htmlFor={`${id}-language`}>{t('subscribe.language', {}, locale)}</label>
        <select
          id={`${id}-language`}
          className="auth-select"
          name="language"
          autoComplete="language"
          value={value.language}
          onChange={(event) => change({ language: event.target.value === 'ms' ? 'ms' : 'en' })}
        >
          <option value="en">{t('subscribe.english', {}, locale)}</option>
          <option value="ms">{t('subscribe.malay', {}, locale)}</option>
        </select>
      </div>
    </fieldset>
  )
}
