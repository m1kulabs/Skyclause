'use client'

import { useState } from 'react'
import { Button } from '#ui/button'
import { ApiProblem } from '../../lib/api-fetch'
import { t } from './catalogue'
import { overviewApi } from './operations'

type Locale = 'en' | 'ms'
type AskState = 'idle' | 'asking' | 'asked' | 'failed'

/**
 * "Ask for a call" (PRD roles table: start a run): a Sky run now, over today's open windows (CAL-1). The run reads the
 * live inputs like a scheduled one; its bundle reaches the overview through the bundle stream.
 */
export function AskForCall({ org, projectId, locale }: { org: string; projectId: string; locale: Locale }) {
  const [state, setState] = useState<AskState>('idle')
  const [detail, setDetail] = useState<string | null>(null)
  async function ask() {
    setState('asking')
    setDetail(null)
    try {
      await overviewApi('createRun', { org, params: { id: projectId }, body: { pack: 'sky' } })
      setState('asked')
    } catch (error) {
      setDetail(error instanceof ApiProblem ? (error.body.detail ?? null) : null)
      setState('failed')
    }
  }
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button type="button" variant="outline" onClick={() => void ask()} disabled={state === 'asking'}>
        {t(state === 'asking' ? 'overview.ask_call_pending' : 'overview.ask_call', {}, locale)}
      </Button>
      <span role="status" className="type-small text-muted-foreground">
        {state === 'asked' && t('overview.ask_call_done', {}, locale)}
        {state === 'failed' && (detail ?? t('overview.ask_call_failed', {}, locale))}
      </span>
    </span>
  )
}
