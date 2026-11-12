'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { cn } from '#lib/utils'
import { t } from './i18n'
import { parseView, type ProbationView } from './model'
import type { ProbationStatus } from './operations'
import { FrameLabeller } from './frame-labeller'
import { ProgressView } from './progress-view'

interface PanelProps {
  org: string
  project: string
  sourceId: string
  view: string
  role: string | null
  locale?: 'en' | 'ms'
}

const views: ProbationView[] = ['label', 'resolve', 'progress']

export function ProbationPanel({ org, project, sourceId, view, role, locale = 'en' }: PanelProps) {
  const active = parseView(view)
  const [status, setStatus] = useState<ProbationStatus | null>(null)
  const [passedAt, setPassedAt] = useState<string | null>(null)
  const [seen, setSeen] = useState<string[]>([])
  const [resolved, setResolved] = useState<string[]>([])

  const handleStatus = useCallback((next: ProbationStatus) => {
    setStatus(next)
    if (!next.probation) setPassedAt((previous) => previous ?? new Date().toISOString())
  }, [])

  const handleDisagreement = useCallback((frameId: string) => {
    setSeen((previous) => (previous.includes(frameId) ? previous : [...previous, frameId]))
  }, [])

  const handleResolved = useCallback((frameId: string) => {
    setResolved((previous) => (previous.includes(frameId) ? previous : [...previous, frameId]))
  }, [])

  const disagreements = seen.filter((frameId) => !resolved.includes(frameId)).length
  const canManage = role === 'owner' || role === 'admin'
  const picker = role === 'viewer' ? 'none' : canManage ? 'edit' : 'read'

  const href = (target: ProbationView) =>
    `/${encodeURIComponent(org)}/${encodeURIComponent(project)}/signals/probation/${encodeURIComponent(sourceId)}?view=${target}`

  return (
    <div className="probation-page flex min-w-0 flex-col gap-8">
      <header className="flex flex-col gap-gap">
        <h1 className="type-title">{t('probation.title', {}, locale)}</h1>
        {/* One capsule strip: the current view is inverted, marked by aria-current and the current-mark capsule. */}
        <nav
          aria-label={t('probation.views', {}, locale)}
          className="probation-views grid w-full grid-cols-3 gap-1 rounded-full border-2 border-input bg-muted p-1 sm:w-fit sm:grid-cols-[repeat(3,auto)]"
        >
          {views.map((target) => (
            <Link
              key={target}
              href={href(target)}
              aria-current={target === active ? 'page' : undefined}
              className={cn(
                'current-mark flex min-h-11 items-center justify-center rounded-full px-4 pt-2 pb-3.5 text-center text-[14px] leading-5 font-medium text-muted-foreground hover:text-foreground',
                'aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground'
              )}
            >
              {t(`probation.view_${target}`, {}, locale)}
            </Link>
          ))}
        </nav>
      </header>
      {active === 'progress' ? (
        <ProgressView
          org={org}
          project={project}
          sourceId={sourceId}
          status={status}
          passedAt={passedAt}
          disagreements={disagreements}
          picker={picker}
          locale={locale}
          onStatus={handleStatus}
        />
      ) : (
        <FrameLabeller
          key={active}
          sourceId={sourceId}
          mode={active}
          locale={locale}
          onStatus={handleStatus}
          onDisagreement={active === 'resolve' ? handleDisagreement : undefined}
          onResolved={active === 'resolve' ? handleResolved : undefined}
        />
      )}
    </div>
  )
}
