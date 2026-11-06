'use client'

import { useState } from 'react'
import { Button } from '#ui/button'
import { t } from './i18n'

export function CopyButton({ value, label }: { value: string; label: 'copy_config' | 'copy_secret' }) {
  const [status, setStatus] = useState<'copied' | 'copy_error' | undefined>()
  return (
    <div className="connect-copy">
      <Button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value)
            setStatus('copied')
          } catch {
            setStatus('copy_error')
          }
        }}
      >
        {t(`connect.${label}`)}
      </Button>
      <span role="status">{status && t(`connect.${status}`)}</span>
    </div>
  )
}
