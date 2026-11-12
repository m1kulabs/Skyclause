import { useId } from 'react'
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

export function Fields({
  value,
  windows,
  preferences,
  disabled,
  locale,
  onChange,
  onCommit
}: {
  value: SubscriberFields
  windows: Window[]
  preferences: boolean
  disabled: boolean
  locale: 'en' | 'ms'
  onChange: (patch: Partial<SubscriberFields>) => void
  onCommit?: (patch: Partial<SubscriberFields>) => void
}) {
  const id = useId()
  const toggle = <T extends string>(values: T[], item: T) =>
    values.includes(item) ? values.filter((v) => v !== item) : [...values, item]
  const change = (patch: Partial<SubscriberFields>) => {
    onChange(patch)
    onCommit?.(patch)
  }
  return (
    <fieldset disabled={disabled} className="auth-fields">
      <div className="auth-field">
        <label htmlFor={`${id}-email`}>{t('subscribe.email', {}, locale)}</label>
        <Input
          id={`${id}-email`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          className="h-12 text-base md:text-base"
          value={value.email}
          onChange={(event) => onChange({ email: event.target.value })}
          onBlur={(event) => {
            if (event.target.validity.valid) onCommit?.({ email: event.target.value })
          }}
        />
      </div>
      <div className="auth-field">
        <label htmlFor={`${id}-role`}>{t('subscribe.role', {}, locale)}</label>
        <Input
          id={`${id}-role`}
          name="role"
          autoComplete="organization-title"
          required
          className="h-12 text-base md:text-base"
          value={value.role}
          onChange={(event) => onChange({ role: event.target.value })}
          onBlur={(event) => {
            if (event.target.validity.valid) onCommit?.({ role: event.target.value })
          }}
        />
      </div>
      <fieldset className="auth-fieldset">
        <legend className="auth-legend">{t('subscribe.windows', {}, locale)}</legend>
        {!windows.length && <p className="auth-hint">{t('subscribe.no_windows', {}, locale)}</p>}
        {windows.map((window) => (
          <label key={window.id} className="auth-check auth-window">
            <input
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
