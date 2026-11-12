'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

function MeasuredRow({ children, measure }: { children: ReactNode; measure: (height: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = ref.current!
    const observer = new ResizeObserver(() => measure(element.getBoundingClientRect().height))
    observer.observe(element)
    return () => observer.disconnect()
  }, [measure])
  return <div ref={ref}>{children}</div>
}

/* A scroll region needs a tab stop and Home/End for keyboard access: both are set only once the list scrolls. */

/**
 * Variable row heights preserve full titles and source URLs, including the pseudo locale. Up to 50 rows it is a plain
 * list; past that it is a scroll region with a tab stop, rendering only the rows near the viewport.
 */
export function VirtualRows<Item>({
  items,
  render,
  label,
  className,
  estimate = 180
}: {
  items: Item[]
  render: (item: Item, index: number) => ReactNode
  label: string
  className?: string
  /** The height of a row not rendered yet, in pixels. */
  estimate?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const heights = useRef(new Map<number, number>())
  const [scroll, setScroll] = useState(0)
  const [viewport, setViewport] = useState(600)
  const [, resized] = useState(0)
  const virtual = items.length > 50
  // The viewport's height is read when it changes, never during a render.
  useLayoutEffect(() => {
    const element = ref.current
    if (!virtual || !element) return
    const measure = () => setViewport(element.clientHeight || 600)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [virtual])
  const offsets = [0]
  items.forEach((_, index) => offsets.push(offsets[index]! + (heights.current.get(index) ?? estimate)))
  const first = virtual ? Math.max(0, offsets.findIndex((offset) => offset >= scroll) - 6) : 0
  // No row starts below the viewport: the scroller is at its end, so the rows run to the last one.
  const below = offsets.findIndex((offset) => offset > scroll + viewport)
  const last = virtual
    ? below === -1
      ? items.length
      : Math.min(items.length, Math.max(first + 12, below + 6))
    : items.length
  return (
    <div
      ref={ref}
      {...(virtual
        ? {
            role: 'region',
            'aria-label': label,
            tabIndex: 0,
            onScroll: (event) => setScroll(event.currentTarget.scrollTop),
            onKeyDown: (event) => {
              if (event.target !== event.currentTarget) return
              if (event.key === 'End') {
                event.preventDefault()
                event.currentTarget.scrollTop = event.currentTarget.scrollHeight
              }
              if (event.key === 'Home') {
                event.preventDefault()
                event.currentTarget.scrollTop = 0
              }
            }
          }
        : {})}
      className={className}
      data-virtualized={virtual}
    >
      <div style={{ height: virtual ? offsets[first] : 0 }} aria-hidden="true" />
      {items.slice(first, last).map((item, index) => (
        <MeasuredRow
          key={first + index}
          measure={(height) => {
            if (heights.current.get(first + index) === height) return
            heights.current.set(first + index, height)
            // Measured rows change the spacers without a scroll event: read the position again so the window follows.
            if (virtual) setScroll(ref.current?.scrollTop ?? 0)
            resized((value) => value + 1)
          }}
        >
          {render(item, first + index)}
        </MeasuredRow>
      ))}
      <div style={{ height: virtual ? offsets[items.length]! - offsets[last]! : 0 }} aria-hidden="true" />
    </div>
  )
}
