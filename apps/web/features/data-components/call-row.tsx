'use client'

import type { ReactNode } from 'react'
import type { CallView, Verdict, Window } from '@skyclause/contracts'
import { formatTime } from '@skyclause/i18n/format'
import { ModeBadge } from '../brand/mode-badge'
import { t } from './catalogue'

export interface CallRowProps {
  call?: CallView
  dashboard?: { projectName: string; window: Window; verdict: Verdict }
  actions?: ReactNode
  locale?: 'en' | 'ms'
}

export function CallRow({ call, dashboard, actions = null, locale = 'en' }: CallRowProps) {
  if (dashboard) {
    return (
      <tr data-dashboard-call-row={dashboard.window.id} className="block border-b border-rule md:table-row">
        <td colSpan={4} className="block p-2 md:table-cell">
          <span className="flex min-h-[34px] flex-wrap items-center gap-2 [@media(pointer:coarse)]:min-h-[44px]">
            {dashboard.verdict.mode ? (
              <ModeBadge mode={dashboard.verdict.mode} locale={locale} />
            ) : (
              <span>{t('data.call.unknown_mode', {}, locale)}</span>
            )}
            <span>
              {t(
                'data.call.dashboard_window',
                { project: dashboard.projectName, title: dashboard.window.title },
                locale
              )}
            </span>
            <time dateTime={dashboard.window.starts_at} className="text-muted-foreground tabular-nums">
              {formatTime(dashboard.window.starts_at, locale)}
            </time>
          </span>
        </td>
      </tr>
    )
  }
  if (!call) return null

  const scope = call.window_id
    ? t('data.call.window', { id: call.window_id }, locale)
    : call.night_id
      ? t('data.call.night', { id: call.night_id }, locale)
      : t('data.call.fired_empty', {}, locale)
  const firedItems = call.fired.map((f) =>
    t('data.call.fired_item', { clause: f.clause, inputs: f.inputs.join(', ') }, locale)
  )
  const firedEmpty = t('data.call.fired_empty', {}, locale)

  return (
    <tr data-call={call.id} className="group block border-b border-rule md:table-row">
      <td className="block p-2 md:table-cell">
        <span className="flex min-h-[34px] flex-wrap items-center gap-2 [@media(pointer:coarse)]:min-h-[44px]">
          <ModeBadge mode={call.mode ?? 'no_call'} locale={locale} />
          <span>{scope}</span>
          <time dateTime={call.triggered_at} className="text-muted-foreground tabular-nums">
            {formatTime(call.triggered_at, locale)}
          </time>
        </span>
        <span className="mt-1 block text-[13px] text-muted-foreground md:hidden">
          {firedItems.length ? (
            <ul className="flex flex-col gap-1">
              {firedItems.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          ) : (
            firedEmpty
          )}
        </span>
      </td>
      <td className="hidden p-2 text-[13px] text-muted-foreground md:table-cell">
        {firedItems.length ? (
          <ul className="flex flex-col gap-1">
            {firedItems.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        ) : (
          firedEmpty
        )}
      </td>
      <td className="block p-2 text-[13px] tabular-nums md:table-cell">
        <span className="inline-flex flex-wrap items-center gap-2">
          <span>{t(`data.call.state_${call.state}`, {}, locale)}</span>
          <time dateTime={call.expires_at}>
            {t('data.call.expires', { time: formatTime(call.expires_at, locale) }, locale)}
          </time>
        </span>
      </td>
      <td className="block p-2 md:table-cell">
        <span
          role="group"
          className="flex min-h-[34px] items-center gap-2 opacity-100 group-focus-within:opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 [@media(pointer:coarse)]:min-h-[44px]"
          aria-label={t('data.call.actions', {}, locale)}
        >
          {actions}
        </span>
      </td>
    </tr>
  )
}
