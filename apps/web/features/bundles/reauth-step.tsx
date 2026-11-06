'use client'

import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useReauth, ReauthDialog } from '../reauth'
import { t } from './i18n'

// #100 owns authentication. Its current placeholder throws when the hook is first used.
// Never treat a placeholder or a cancelled check as successful authentication.
class ReauthBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  override render() {
    return this.state.failed ? <ReauthUnavailable /> : this.props.children
  }
}

function ReauthUnavailable() {
  return (
    <div>
      <p>{t('bundles.reauth_unavailable')}</p>
      <Link href="/sign-in" prefetch={false}>
        {t('bundles.sign_in')}
      </Link>
    </div>
  )
}

function Step({ onSuccess, onCancel }: { onSuccess: () => Promise<void>; onCancel: () => void }) {
  const { requireReauth } = useReauth()
  const [failed, setFailed] = useState(false)
  const attempt = useRef<Promise<void> | undefined>(undefined)
  useEffect(() => {
    let active = true
    attempt.current ??= requireReauth()
    void attempt.current
      .then(async () => {
        if (active) await onSuccess()
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [requireReauth, onSuccess])
  return (
    <>
      <ReauthDialog
        open
        onOpenChange={(open) => {
          if (!open) onCancel()
        }}
      />
      {failed && <ReauthUnavailable />}
    </>
  )
}

export function ReauthStep(props: { onSuccess: () => Promise<void>; onCancel: () => void }) {
  return (
    <ReauthBoundary>
      <Step {...props} />
    </ReauthBoundary>
  )
}
