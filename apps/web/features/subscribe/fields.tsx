import { useId } from 'react'
import type { Subscriber, Window } from '@skyclause/contracts'
import { formatDateTime } from '@skyclause/i18n/format'
import { Input } from '#ui/input'
import { t } from './catalogue'

export type SubscriberFields = Pick<Subscriber, 'email' | 'role' | 'window_ids' | 'channels' | 'language'>
export const noticeChannels = ['email', 'ics', 'webhook', 'in_app'] as const
export const controlClass =
  'min-h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 py-2 text-foreground'
export const actionClass = 'h-auto min-h-11 max-w-full whitespace-normal break-words px-4 py-2'

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
    <fieldset disabled={disabled} className="grid min-w-0 gap-5">
      <label className="grid min-w-0 gap-2" htmlFor={`${id}-email`}>
        {t('subscribe.email', {}, locale)}
        <Input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          required
          value={value.email}
          onChange={(event) => onChange({ email: event.target.value })}
          onBlur={(event) => {
            if (event.target.validity.valid) onCommit?.({ email: event.target.value })
          }}
        />
      </label>
      <label className="grid min-w-0 gap-2" htmlFor={`${id}-role`}>
        {t('subscribe.role', {}, locale)}
        <Input
          id={`${id}-role`}
          name="role"
          required
          value={value.role}
          onChange={(event) => onChange({ role: event.target.value })}
          onBlur={(event) => {
            if (event.target.validity.valid) onCommit?.({ role: event.target.value })
          }}
        />
      </label>
      <fieldset className="grid min-w-0 gap-2">
        <legend className="mb-2">{t('subscribe.windows', {}, locale)}</legend>
        {!windows.length && <p className="text-muted-foreground">{t('subscribe.no_windows', {}, locale)}</p>}
        {windows.map((window) => (
          <label key={window.id} className="flex min-h-11 min-w-0 items-start gap-3 py-2 [overflow-wrap:anywhere]">
            <input
              className="mt-1 size-5 shrink-0 accent-primary"
              type="checkbox"
              name="window_ids"
              value={window.id}
              checked={value.window_ids.includes(window.id)}
              onChange={() => change({ window_ids: toggle(value.window_ids, window.id) })}
            />
            <span>
              {t(
                'subscribe.window_label',
                {
                  title: window.title,
                  start: formatDateTime(window.starts_at, locale),
                  end: formatDateTime(window.ends_at, locale)
                },
                locale
              )}
            </span>
          </label>
        ))}
      </fieldset>
      {preferences && (
        <fieldset className="grid gap-2">
          <legend className="mb-2">{t('subscribe.channels', {}, locale)}</legend>
          {noticeChannels.map((channel) => (
            <label key={channel} className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                className="size-5 shrink-0 accent-primary"
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
      <label className="grid min-w-0 gap-2" htmlFor={`${id}-language`}>
        {t('subscribe.language', {}, locale)}
        <select
          id={`${id}-language`}
          className={controlClass}
          name="language"
          value={value.language}
          onChange={(event) => change({ language: event.target.value === 'ms' ? 'ms' : 'en' })}
        >
          <option value="en">{t('subscribe.english', {}, locale)}</option>
          <option value="ms">{t('subscribe.malay', {}, locale)}</option>
        </select>
      </label>
    </fieldset>
  )
}
