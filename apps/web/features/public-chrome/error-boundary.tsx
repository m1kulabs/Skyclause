'use client'

import { PublicErrorContent } from './errors'
import type { PublicLocale } from './attribution'

export function PublicErrorBoundary({ locale = 'en' }: { locale?: PublicLocale }) {
  return <PublicErrorContent locale={locale} />
}
