import * as React from 'react'
import { cn } from '#lib/utils'

/*
 * The one table. Its look (the 44px pitch, the capsule header strip, row states, the phone list) lives in the "Tables"
 * block of styles/globals.css, keyed on the data-slot and data attributes set here; this file sets the structure.
 *
 * - Rows sit on a 44px pitch (the density setting's `--density-row-height`); `compact` makes it 40px.
 * - Rows are told apart by space and by tone (the hover, selected and dimmed states), never by rules. The header is one
 *   quiet capsule strip on the raised tone: 13px muted, sentence case.
 * - A column opts in to `numeric` (right-aligned, Skyclause Figures, `data-numeric`) and to `truncate` (one line with an
 *   ellipsis and a `title`). A `title` is taken from a string child; pass one for anything else.
 * - `sticky` pins the header under the shell bar (`top: var(--shell-bar-height, 0px)`).
 * - Below 640px every row becomes a two-line list item (`phone="list"`, the default): see the `phone` prop on TableCell.
 *   `phone="scroll"` keeps the table and scrolls it sideways instead, for a table whose columns only mean something
 *   together.
 * - `<TableMeasure value max>` draws a capsule-ended fill behind a figure, so a column measures as well as reads.
 */

interface TableProps extends React.ComponentProps<'table'> {
  /** A 40px pitch instead of the density setting's 44px. */
  compact?: boolean
  /** Pin the header under the shell bar while the page scrolls. */
  sticky?: boolean
  /** `list` (default): rows become two-line list items below 640px. `scroll`: the table scrolls sideways. */
  phone?: 'list' | 'scroll'
}

function Table({ className, compact, sticky, phone = 'list', ...props }: TableProps) {
  return (
    <div
      data-slot="table-container"
      data-sticky={sticky ? '' : undefined}
      // overflow-x: auto would make the container the header's scroll parent; `clip` leaves the page as the parent.
      className={cn('relative w-full', sticky ? 'overflow-x-clip' : 'overflow-x-auto')}
    >
      <table
        data-slot="table"
        data-compact={compact ? '' : undefined}
        data-sticky={sticky ? '' : undefined}
        data-phone={phone}
        className={cn(
          'w-full border-separate border-spacing-0 caption-bottom text-[14px] leading-5 tabular-nums [--table-row:var(--density-row-height)] data-compact:[--table-row:40px]',
          className
        )}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={cn('[&_tr]:h-10', className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody data-slot="table-body" className={className} {...props} />
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return <tfoot data-slot="table-footer" className={cn('font-medium', className)} {...props} />
}

interface TableRowProps extends React.ComponentProps<'tr'> {
  /** The open or current row: the overlay tone, a capsule mark at its start, `aria-current`. */
  selected?: boolean
  /** A row that stays in place but steps back: muted ink. A dimmed row keeps its words. */
  dimmed?: boolean
}

function TableRow({ className, selected, dimmed, ...props }: TableRowProps) {
  return (
    <tr
      data-slot="table-row"
      data-state={selected ? 'selected' : dimmed ? 'dimmed' : undefined}
      aria-current={selected ? 'true' : undefined}
      className={cn('h-(--table-row,var(--density-row-height))', className)}
      {...props}
    />
  )
}

interface TableHeadProps extends React.ComponentProps<'th'> {
  /** Right-aligned figures: `data-numeric`. */
  numeric?: boolean
}

function TableHead({ className, numeric, ...props }: TableHeadProps) {
  return (
    <th
      data-slot="table-head"
      data-numeric={numeric ? '' : undefined}
      className={cn(
        'px-3 text-left align-middle text-[13px] font-medium tracking-normal whitespace-nowrap text-muted-foreground normal-case data-numeric:text-right',
        className
      )}
      {...props}
    />
  )
}

interface TableCellProps extends React.ComponentProps<'td'> {
  /** Right-aligned figures: `data-numeric` (Skyclause Figures, tabular). */
  numeric?: boolean
  /**
   * One line with an ellipsis, capped at 28ch or at the CSS length you pass ("40ch"). A string child becomes the
   * `title` unless you pass one; give a `title` for anything else.
   */
  truncate?: boolean | string
  /**
   * Where the cell goes in the phone list. `primary`: line one, the row's name (the first cell by default). `end`:
   * line one, pushed to the right (a status or the key figure). `meta` (the default for the rest): line two, 13px
   * muted. `hide`: left out on a phone.
   */
  phone?: 'primary' | 'end' | 'meta' | 'hide'
  /** Shown before a `meta` cell on a phone, where the column header is gone (for example "Delay"). */
  label?: string
}

function TableCell({ className, numeric, truncate, phone, label, title, children, ...props }: TableCellProps) {
  const text = typeof children === 'string' || typeof children === 'number' ? String(children) : undefined
  return (
    <td
      data-slot="table-cell"
      data-numeric={numeric ? '' : undefined}
      data-truncate={truncate ? '' : undefined}
      data-phone={phone}
      data-label={label}
      title={title ?? (truncate ? text : undefined)}
      className={cn('px-3 py-2 align-middle whitespace-nowrap data-numeric:text-right', className)}
      {...props}
    >
      {truncate ? (
        <span
          data-slot="table-truncate"
          className="block overflow-hidden text-ellipsis"
          style={{ maxWidth: typeof truncate === 'string' ? truncate : '28ch' }}
        >
          {children}
        </span>
      ) : (
        children
      )}
    </td>
  )
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption data-slot="table-caption" className={cn('mt-3 text-[13px] text-muted-foreground', className)} {...props} />
  )
}

interface TableMeasureProps extends React.ComponentProps<'span'> {
  /** The figure's size; the fill is `value / max` of the column's width. */
  value: number
  max?: number
  /** Which side the fill grows from; a right-aligned figure grows leftwards (`end`, the default). */
  align?: 'start' | 'end'
}

/**
 * A capsule-ended fill behind a figure. The figure inside carries the value in words (the fill is decoration and is
 * hidden from assistive technology), so give it `data-numeric` text; it never replaces the number.
 */
function TableMeasure({ value, max = 1, align = 'end', className, children, ...props }: TableMeasureProps) {
  const share = max > 0 && Number.isFinite(value) ? Math.min(1, Math.max(0, value / max)) : 0
  return (
    <span
      data-slot="table-measure"
      data-align={align}
      style={{ '--measure': share } as React.CSSProperties}
      className={cn(
        'relative flex min-h-7 w-full items-center px-2.5',
        align === 'end' ? 'justify-end' : '',
        className
      )}
      {...props}
    >
      <span aria-hidden="true" data-slot="table-measure-fill" data-empty={share === 0 ? '' : undefined} />
      <span className="relative">{children}</span>
    </span>
  )
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption, TableMeasure }
