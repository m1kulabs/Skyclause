'use client'

import * as React from 'react'
import { cn } from '#lib/utils'

type TriageView = 'list' | 'item' | 'details'

/**
 * Three regions on one ground: the list (fixed width), the open item, and its details (fixed width). From 1100px all
 * three stand side by side; from 641px the details go under the open item; on a phone one region shows at a time,
 * chosen by `view` (the caller keeps it in state and offers its own back control). When `view` changes and the region
 * that held focus has gone (it is hidden on a phone), focus moves to the region now showing, so a keyboard or
 * screen-reader user is not dropped on the page; where all the regions stay visible, focus stays where it is.
 */
function TriageLayout({
  list,
  item,
  details,
  view = 'list',
  labels,
  className
}: {
  list: React.ReactNode
  item: React.ReactNode
  details?: React.ReactNode
  /** The region a phone shows. */
  view?: TriageView
  /** Each region's accessible name, from the caller's catalogue. */
  labels: { list: string; item: string; details?: string }
  className?: string
}) {
  const region = (name: TriageView) =>
    cn('min-w-0 focus-visible:outline-none!', view === name ? 'max-[640px]:block' : 'max-[640px]:hidden')
  const regions = React.useRef<Record<TriageView, HTMLElement | null>>({ list: null, item: null, details: null })
  const shown = React.useRef(view)
  React.useEffect(() => {
    const before = shown.current
    shown.current = view
    if (before === view) return
    const gone = regions.current[before]
    const now = regions.current[view]
    // Only when the region that was showing is hidden now (a phone): elsewhere nothing moved out from under focus.
    if (gone && now && getComputedStyle(gone).display === 'none') now.focus({ preventScroll: true })
  }, [view])
  return (
    <div
      data-slot="triage-layout"
      data-view={view}
      className={cn(
        'grid gap-4 min-[641px]:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] min-[1100px]:grid-cols-[minmax(306px,384px)_minmax(0,1fr)_minmax(280px,340px)]',
        className
      )}
    >
      <section
        ref={(node) => {
          regions.current.list = node
        }}
        tabIndex={-1}
        data-slot="triage-list"
        aria-label={labels.list}
        className={cn(region('list'), 'min-[641px]:row-span-2')}
      >
        {list}
      </section>
      <section
        ref={(node) => {
          regions.current.item = node
        }}
        tabIndex={-1}
        data-slot="triage-item"
        aria-label={labels.item}
        className={cn(region('item'), 'rounded-xl bg-card p-5')}
      >
        {item}
      </section>
      {details ? (
        <section
          ref={(node) => {
            regions.current.details = node
          }}
          tabIndex={-1}
          data-slot="triage-details"
          aria-label={labels.details ?? labels.item}
          className={cn(region('details'), 'min-[641px]:col-start-2 min-[1100px]:col-start-3 min-[1100px]:row-start-1')}
        >
          {details}
        </section>
      ) : null}
    </div>
  )
}

/** A row of the triage list: two lines on a 64px pitch; the selected row takes the overlay fill and aria-current. */
function TriageRow({
  className,
  selected = false,
  children,
  ...props
}: React.ComponentProps<'a'> & { selected?: boolean }) {
  return (
    <a
      data-slot="triage-row"
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex min-h-16 flex-col justify-center gap-0.5 rounded-md px-3 py-2 text-[14px] hover:bg-muted aria-[current=true]:bg-accent aria-[current=true]:text-accent-foreground',
        className
      )}
      {...props}
    >
      {children}
    </a>
  )
}

export { TriageLayout, TriageRow, type TriageView }
