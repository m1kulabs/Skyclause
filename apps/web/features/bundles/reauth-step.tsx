'use client'

import { ReauthDialog } from '../reauth'

export function ReauthStep({ onCancel }: { onCancel: () => void }) {
  return (
    <ReauthDialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    />
  )
}
