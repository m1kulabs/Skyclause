import type { ReactNode } from 'react'
import { cn } from '#lib/utils'

/** The one column every subscriber page sits in: a main landmark in the page's own language. */
export function SubscribeColumn({
  locale,
  wide = false,
  children
}: {
  locale: 'en' | 'ms'
  /** The data page holds tables, so its column is wider than a form's. */
  wide?: boolean
  children: ReactNode
}) {
  return (
    <main className={cn('auth-page subscribe-column', wide && 'subscribe-wide')} lang={locale}>
      {children}
    </main>
  )
}
