'use client'

import { Component, useEffect, type ReactNode } from 'react'
import { NotBuiltError } from '@skyclause/contracts'
import { ReauthDialog, useReauth } from '../reauth'
import { Button } from '#ui/button'
import { t } from './i18n'

/** Keep #100's shared hook behind an action boundary while its owner finishes it. */
class StepUpBoundary extends Component<{ children: ReactNode; cancel: () => void }, { unavailable: boolean }> {
  override state = { unavailable: false }
  static getDerivedStateFromError(error: unknown) {
    if (!(error instanceof NotBuiltError)) throw error
    return { unavailable: true }
  }
  override render() {
    if (this.state.unavailable)
      return (
        <div role="alert">
          <p>{t('connect.reauth_unavailable')}</p>
          <Button variant="outline" onClick={this.props.cancel}>
            {t('connect.cancel')}
          </Button>
        </div>
      )
    return this.props.children
  }
}

function RequestStepUp({ resolve, cancel }: { resolve: () => void; cancel: () => void }) {
  const { requireReauth } = useReauth()
  useEffect(() => {
    void requireReauth().then(resolve, cancel)
  }, [requireReauth, resolve, cancel])
  return (
    <ReauthDialog
      open
      onOpenChange={(open) => {
        if (!open) cancel()
      }}
    />
  )
}

export function StepUp(props: { resolve: () => void; cancel: () => void }) {
  return (
    <StepUpBoundary cancel={props.cancel}>
      <RequestStepUp {...props} />
    </StepUpBoundary>
  )
}
