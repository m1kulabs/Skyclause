'use client'

import type { ReactNode } from 'react'
import type { Bundle } from '@skyclause/contracts'
import { formatTime } from '@skyclause/i18n/format'
import { ModeBadge } from '../brand/mode-badge'
import { Card, CardContent, CardHeader, CardTitle } from '#ui/card'
import { t } from './catalogue'
import { useMounted } from './use-mounted'

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
  // Without a `now` the SLA waits for the page to be live: the server's clock would differ from the client's.
  const mounted = useMounted()
  const nowMs = now ? new Date(now).getTime() : mounted ? Date.now() : null
  const slaMs = bundle.sla_due_at && nowMs !== null ? new Date(bundle.sla_due_at).getTime() - nowMs : null
  const slaLeft = slaMs === null ? 0 : Math.max(0, Math.round(slaMs / 60_000))
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
          <span className="type-small text-muted-foreground">{t('data.bundle.calls_title', {}, locale)}</span>
          {modes.map((mode) => (
            <ModeBadge key={mode} mode={mode} pack={bundle.pack} locale={locale} />
          ))}
        </div>
        {slaMs !== null ? (
          <p className="mt-2 type-body tabular-nums">
            {slaMs >= 0 ? t('data.bundle.sla', { count: slaLeft }, locale) : t('data.bundle.sla_over', {}, locale)}
          </p>
        ) : null}
        <p className="mt-1 type-body">
          {disagreements === 0
            ? t('data.bundle.agrees', {}, locale)
            : t('data.bundle.disagrees', { count: disagreements }, locale)}
        </p>
        {bundle.escalation_level > 0 ? (
          <p className="mt-1 text-[13px] text-muted-foreground tabular-nums">
            {t('data.bundle.escalation', { level: bundle.escalation_level }, locale)}
          </p>
        ) : null}
        {bundle.draft_only || actions ? (
          <div
            role="group"
            className="mt-3 flex min-h-[34px] flex-wrap items-center gap-2 [@media(pointer:coarse)]:min-h-[44px]"
            aria-label={t('data.bundle.actions', {}, locale)}
          >
            {bundle.draft_only ? <span>{t('data.bundle.draft_only', {}, locale)}</span> : actions}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
