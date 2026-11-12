'use client'

import { PublicErrorContent } from './errors'
import type { PublicLocale } from './attribution'

export function PublicErrorBoundary({ locale = 'en', reset }: { locale?: PublicLocale; reset?: () => void }) {
  return <PublicErrorContent locale={locale} reset={reset} />
}
