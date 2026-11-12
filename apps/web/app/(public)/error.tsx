'use client'

import { PublicErrorBoundary } from '../../features/public-chrome/error-boundary'

export default function PublicError({ reset }: { reset: () => void }) {
  return <PublicErrorBoundary locale="en" reset={reset} />
}
