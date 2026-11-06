'use client'

/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- Scroll regions need a tab stop and Home/End for keyboard access. */

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

/** Variable row heights preserve full titles and source URLs, including the pseudo locale. */
export function VirtualRows<Item>({
  items,
  render,
  label,
  className
}: {
  items: Item[]
  render: (item: Item, index: number) => ReactNode
  label: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const heights = useRef(new Map<number, number>())
  const [scroll, setScroll] = useState(0)
  const [, resized] = useState(0)
  const virtual = items.length > 50
  const offsets = [0]
  items.forEach((_, index) => offsets.push(offsets[index]! + (heights.current.get(index) ?? 180)))
  const first = virtual ? Math.max(0, offsets.findIndex((offset) => offset >= scroll) - 6) : 0
  const last = virtual
    ? Math.min(
        items.length,
        Math.max(first + 12, offsets.findIndex((offset) => offset > scroll + (ref.current?.clientHeight ?? 600)) + 6)
      )
    : items.length
  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      tabIndex={0}
      className={className}
      data-virtualized={virtual}
      onScroll={(event) => setScroll(event.currentTarget.scrollTop)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'End') {
          event.preventDefault()
          event.currentTarget.scrollTop = event.currentTarget.scrollHeight
        }
        if (event.key === 'Home') {
          event.preventDefault()
          event.currentTarget.scrollTop = 0
        }
      }}
    >
      <div style={{ height: virtual ? offsets[first] : 0 }} aria-hidden="true" />
      {items.slice(first, last).map((item, index) => (
        <MeasuredRow
          key={first + index}
          measure={(height) => {
            if (heights.current.get(first + index) === height) return
            heights.current.set(first + index, height)
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
