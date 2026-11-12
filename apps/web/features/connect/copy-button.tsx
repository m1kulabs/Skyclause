'use client'

import { useState } from 'react'
import { CopyIcon } from 'lucide-react'
import { Button } from '#ui/button'
import { t, type Locale } from './i18n'

export function CopyButton({
  value,
  label,
  locale
}: {
  value: string
  label: 'copy_config' | 'copy_secret'
  locale: Locale
}) {
  const [status, setStatus] = useState<'copied' | 'copy_error' | undefined>()
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
      <span role="status" className="type-small text-muted-foreground">
        {status && t(`connect.${status}`, {}, locale)}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value)
            setStatus('copied')
          } catch {
            setStatus('copy_error')
          }
        }}
      >
        <CopyIcon data-icon="inline-start" />
        {t(`connect.${label}`, {}, locale)}
      </Button>
    </div>
  )
}
