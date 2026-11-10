'use client'

import { useEffect } from 'react'
import { ReauthDialog, useReauth } from '../reauth'

export function StepUp({ resolve, cancel }: { resolve: () => void; cancel: () => void }) {
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
