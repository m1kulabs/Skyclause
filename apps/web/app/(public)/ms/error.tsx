'use client'

import { PublicErrorBoundary } from '../../../features/public-chrome/error-boundary'

export default function MalayPublicError({ reset }: { reset: () => void }) {
  return <PublicErrorBoundary locale="ms" reset={reset} />
}
