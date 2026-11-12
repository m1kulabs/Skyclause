'use client'

import { useId, useState, type ComponentProps, type ReactNode } from 'react'
import { t } from '@skyclause/i18n'
import { Button } from '#ui/button'
import { cn } from '#lib/utils'
import { ApiProblem } from '../../../lib/api-fetch'
import { Glyph } from '../../brand/glyph'
import { SourceError } from '../../data-components/states'

/**
 * Parts for what sits inside a project settings panel. The frame supplies the row (label column and panel on the
 * surface step); these separate the panel's parts by space and by tone, never by rules.
 */

/**
 * A native date or time input keeps no :focus-visible ring of its own in every browser: its field draws the ring
 * round the label and the input together (the crawl accepts a [data-focus-ring] owner).
 */
export const dateFieldRing =
  'rounded-sm focus-within:outline-solid focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring'

/** The panel's parts in one column with the space between them. */
export function Parts({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('grid min-w-0 gap-10', className)} {...props} />
}

/** A titled part: its heading, what it does in a sentence, then its content; `actions` end its header. */
export function Part({
  title,
  description,
  actions,
  children,
  className,
  id
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
  id?: string
}) {
  const generated = useId()
  const headingId = id ?? `part-${generated}`
  return (
    <section aria-labelledby={headingId} className={cn('grid min-w-0 gap-4', className)}>
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="grid min-w-0 gap-1">
          <h3 id={headingId} className="type-card-title [overflow-wrap:anywhere]">
            {title}
          </h3>
          {description ? <p className="type-body text-muted-foreground">{description}</p> : null}
        </div>
        {actions}
      </header>
      {children}
    </section>
  )
}

/** Records, each on its own raised tile: tone separates them. */
export function Rows({ className, ...props }: ComponentProps<'ul'>) {
  return <ul className={cn('m-0 grid min-w-0 list-none gap-2 p-0', className)} {...props} />
}

export function Row({ className, ...props }: ComponentProps<'li'>) {
  return (
    <li
      className={cn(
        'flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-md bg-raised px-4 py-3',
        className
      )}
      {...props}
    />
  )
}

/** A failure beside what failed, announced, with the error glyph so it is never told by tone alone. */
export function Problem({ children, id, className }: { children: ReactNode; id?: string; className?: string }) {
  return (
    <p id={id} role="alert" className={cn('type-body flex items-start gap-2 font-medium', className)}>
      <Glyph state="error" className="mt-1.5" />
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </p>
  )
}

/** A quiet confirmation of what a control just did, announced politely. */
export function Notice({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <p role="status" className={cn('type-body text-muted-foreground', className)}>
      {children}
    </p>
  )
}

/** A destructive part: last in its panel, on a raised tile, with what it does in words before the control. */
export function Danger({
  title,
  description,
  children,
  id
}: {
  title: string
  description: ReactNode
  children: ReactNode
  id?: string
}) {
  const generated = useId()
  const headingId = id ?? `danger-${generated}`
  return (
    <section aria-labelledby={headingId} className="grid min-w-0 gap-3 rounded-md bg-raised p-4">
      <h3 id={headingId} className="type-card-title [overflow-wrap:anywhere]">
        {title}
      </h3>
      <p className="type-body text-muted-foreground">{description}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  )
}

/** A failed or unbuilt read inside the panel that needed it: named, with its answer, never an empty state. */
export function ReadFailed({
  source,
  error,
  onRetry,
  locale = 'en'
}: {
  /** What could not be read, as it reads mid-sentence ("the share links"). */
  source: string
  error?: unknown
  onRetry: () => void
  locale?: 'en' | 'ms'
}) {
  const [at] = useState(() => new Date().toISOString())
  return (
    <SourceError
      source={source}
      status={error instanceof ApiProblem ? error.status : null}
      at={at}
      locale={locale}
      retry={
        <Button type="button" variant="outline" onClick={onRetry}>
          {t('data.source_error.retry', {}, locale)}
        </Button>
      }
    />
  )
}
