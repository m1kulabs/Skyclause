import { t } from '@skyclause/i18n'
import { cn } from '#lib/utils'
import { Loader2Icon } from 'lucide-react'

/** A spinning glyph with its word. Under reduced motion the glyph stops and "Loading…" shows, so nothing is told by motion alone. */
function Spinner({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span data-slot="spinner" role="status" className={cn('inline-flex items-center gap-1.5', className)} {...props}>
      <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
      <span data-slot="spinner-label" className="sr-only text-[13px] calm:not-sr-only">
        {t('shell.loading')}
      </span>
    </span>
  )
}

export { Spinner }
