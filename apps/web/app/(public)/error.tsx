'use client'

import { PublicErrorBoundary } from '../../features/public-chrome/error-boundary'

export default function PublicError() {
  return <PublicErrorBoundary locale="en" />
}
