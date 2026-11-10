'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { t } from './i18n'
import { parseView, type ProbationView } from './model'
import type { ProbationStatus } from './operations'
import { FrameLabeller } from './frame-labeller'
import { ProgressView } from './progress-view'
import './probation.css'

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
    <div className="probation-page">
      <header>
        <h1>{t('probation.title', {}, locale)}</h1>
        <nav aria-label={t('probation.views', {}, locale)} className="probation-views">
          {views.map((target) => (
            <Link key={target} href={href(target)} aria-current={target === active ? 'page' : undefined}>
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
