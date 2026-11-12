'use client'

import { createPortal } from 'react-dom'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { t } from '@skyclause/i18n'
import { Button } from '#ui/button'
import { Label } from '#ui/label'
import { Switch } from '#ui/switch'
import { cn } from '#lib/utils'
import { ApiProblem } from '../../lib/api-fetch'
import { Glyph } from '../brand/glyph'
import { SourceError } from '../data-components/states'

/**
 * Building blocks for what sits inside a settings panel. The frame supplies the row (label column and panel); these
 * give every panel the same parts: a titled part, a field with its limit and error, a switch row, a quiet list row,
 * a status line and a destructive part. Parts separate by space and tone, never by rules.
 */

/** The panel's parts, in one column with the space between them. */
export function SettingsParts({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('grid min-w-0 gap-10', className)} {...props} />
}

export function SettingsPart({
  title,
  description,
  children,
  className,
  id,
  actions
}: {
  title: string
  description?: ReactNode
  children?: ReactNode
  className?: string
  id?: string
  /** A control that belongs to the part as a whole, set at the end of its header. */
  actions?: ReactNode
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

export interface FieldAria {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: true
}

/**
 * A field: its label above, the control (given the id and the aria ties), the limit beside it, and the error beside
 * that. The limit and the error are tied to the control with aria-describedby; the error is announced.
 */
export function SettingsField({
  label,
  hint,
  error,
  children,
  className
}: {
  label: string
  /** What the field accepts or how long it may be: always visible, never a tooltip. */
  hint?: ReactNode
  error?: ReactNode
  children: (aria: FieldAria) => ReactNode
  className?: string
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('grid min-w-0 content-start gap-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint ? (
        <p id={hintId} className="type-small text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? <SettingsError id={errorId}>{error}</SettingsError> : null}
    </div>
  )
}

/** A failure, announced, with the error glyph so it is never told by tone alone. */
export function SettingsError({ children, id, className }: { children: ReactNode; id?: string; className?: string }) {
  return (
    <p id={id} role="alert" className={cn('type-small flex items-start gap-2 font-medium text-foreground', className)}>
      <Glyph state="error" className="mt-1" />
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </p>
  )
}

/** A quiet confirmation of what a control just did ("Saved"), announced politely. */
export function SettingsStatus({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <p role="status" className={cn('type-small text-muted-foreground', className)}>
      {children}
    </p>
  )
}

/** A switch with its title, its description and the current state in words, the switch at the end of the row. */
export function SettingsSwitchRow({
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
  id,
  name,
  state
}: {
  title: string
  description?: ReactNode
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  id?: string
  name?: string
  /** The state in words ("On", "Off"): the switch alone never carries it. */
  state?: string
}) {
  const generated = useId()
  const switchId = id ?? `switch-${generated}`
  const descriptionId = `${switchId}-description`
  return (
    <div data-density-row className="flex min-w-0 items-center justify-between gap-4">
      <div className="grid min-w-0 gap-1">
        <Label htmlFor={switchId} className="[overflow-wrap:anywhere]">
          <span>{title}</span>
          {state ? <span className="type-small font-normal text-muted-foreground">{state}</span> : null}
        </Label>
        {description ? (
          <p id={descriptionId} className="type-small text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <Switch
        id={switchId}
        name={name}
        checked={checked}
        disabled={disabled}
        aria-label={title}
        aria-describedby={description ? descriptionId : undefined}
        onCheckedChange={onCheckedChange}
      />
    </div>
  )
}

/** A list of records, each on its own raised tile: tone separates them, not rules. */
export function SettingsList({ className, ...props }: React.ComponentProps<'ul'>) {
  return <ul className={cn('m-0 grid min-w-0 list-none gap-2 p-0', className)} {...props} />
}

export function SettingsItem({ className, ...props }: React.ComponentProps<'li'>) {
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

/**
 * A destructive part: last in its panel, on a raised tile, with what it does in words before the control that does it.
 * The control opens a dialog that names the thing; this part says what stays afterwards.
 */
export function SettingsDanger({
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
      <div className="grid gap-2 type-body text-muted-foreground">{description}</div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  )
}

/**
 * Puts a section's summary of its current values, or its help, in the frame's label column, so a panel much taller
 * than its label never leaves that column empty. Renders nothing in the panel itself.
 */
export function SettingsAside({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<Element | null>(null)
  useEffect(() => {
    setSlot(document.querySelector('[data-settings-aside]'))
  }, [])
  return slot ? createPortal(children, slot) : null
}

/** One line of the summary in the label column: what it is, then its value. */
export function SettingsSummaryLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="m-0 grid gap-0.5 [overflow-wrap:anywhere]">
      <span className="type-small text-muted-foreground">{label}</span>
      <span className="text-foreground">{children}</span>
    </p>
  )
}

/** A failed or unbuilt read inside the panel that needed it, named, with a retry. Never an empty state. */
export function SettingsReadError({
  source,
  error,
  at,
  onRetry,
  locale = 'en'
}: {
  /** What could not be read, as it reads mid-sentence ("your sessions"). */
  source: string
  error?: unknown
  /** When it failed (an ISO instant). */
  at: string | null
  onRetry?: () => void
  locale?: 'en' | 'ms'
}) {
  return (
    <SourceError
      source={source}
      status={error instanceof ApiProblem ? error.status : null}
      at={at}
      locale={locale}
      retry={
        onRetry ? (
          <Button type="button" variant="outline" onClick={onRetry}>
            {t('data.source_error.retry', {}, locale)}
          </Button>
        ) : null
      }
    />
  )
}

/** A native select drawn like the other fields (filled, 2px edge): for filters and short lists with a real name. */
export function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        'h-10 w-full min-w-0 rounded-md border-2 border-input bg-raised px-3 text-[14px] text-foreground aria-invalid:border-foreground disabled:cursor-not-allowed disabled:opacity-60',
        className
      )}
      {...props}
    />
  )
}
