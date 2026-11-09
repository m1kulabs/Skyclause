'use client'

import type { ReactNode } from 'react'
import type { Bundle } from '@skyclause/contracts'
import { formatTime } from '@skyclause/i18n/format'
import { ModeBadge } from '../brand/mode-badge'
import { Card, CardContent, CardHeader, CardTitle } from '#ui/card'
import { t } from './catalogue'

export interface BundleCardProps {
  bundle: Bundle
  trigger?: string | null
  triggeredAt?: string | null
  projectName?: string | null
  actions?: ReactNode
  now?: string | null
  locale?: 'en' | 'ms'
}

export function BundleCard({
  bundle,
  trigger = null,
  triggeredAt = null,
  projectName = null,
  actions = null,
  now = null,
  locale = 'en'
}: BundleCardProps) {
  const nowMs = now ? new Date(now).getTime() : Date.now()
  const slaMs = bundle.sla_due_at ? new Date(bundle.sla_due_at).getTime() - nowMs : 0
  const slaLeft = Math.max(0, Math.round(slaMs / 60_000))
  const disagreements = bundle.calls.filter((call) => !call.agrees).length
  const modes = [...new Set(bundle.calls.map((call) => call.mode ?? 'no_call'))]
  const time = triggeredAt ?? bundle.sla_due_at
  const timeText = time ? formatTime(time, locale) : ''
  const triggerText = trigger ? t('data.bundle.trigger', { trigger, time: timeText }, locale) : timeText
  const title = projectName ? t('data.bundle.title', { triggerText, project: projectName }, locale) : triggerText

  return (
    <Card data-bundle={bundle.id}>
      <CardHeader>
        <CardTitle className="tabular-nums">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{t('data.bundle.calls_title', {}, locale)}</span>
          {modes.map((mode) => (
            <ModeBadge key={mode} mode={mode} pack={bundle.pack} locale={locale} />
          ))}
        </div>
        {bundle.sla_due_at ? (
          <p className="mt-2 text-sm tabular-nums">
            {slaMs >= 0 ? t('data.bundle.sla', { count: slaLeft }, locale) : t('data.bundle.sla_over', {}, locale)}
          </p>
        ) : null}
        <p className="mt-1 text-sm">
          {disagreements === 0
            ? t('data.bundle.agrees', {}, locale)
            : t('data.bundle.disagrees', { count: disagreements }, locale)}
        </p>
        {bundle.escalation_level > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            {t('data.bundle.escalation', { level: bundle.escalation_level }, locale)}
          </p>
        ) : null}
        <div
          className="mt-3 flex min-h-[34px] flex-wrap items-center gap-2 [@media(pointer:coarse)]:min-h-[44px]"
          aria-label={t('data.bundle.actions', {}, locale)}
        >
          {bundle.draft_only ? <span>{t('data.bundle.draft_only', {}, locale)}</span> : actions}
        </div>
      </CardContent>
    </Card>
  )
}
