'use client'

import { useCallback, useEffect } from 'react'
import { cancelStepUp, requireStepUp, withStepUp } from './flow'

export interface Reauth {
  requireReauth: () => Promise<void>
  /** Run an idempotent write and, after step-up, retry it with the same key. */
  withReauth: <T>(request: (idempotencyKey: string) => Promise<T>, onRequired: () => void) => Promise<T>
}

export function useReauth(): Reauth {
  useEffect(() => () => cancelStepUp(), [])
  const requireReauth = useCallback(() => requireStepUp(), [])
  const withReauth = useCallback(
    <T>(request: (idempotencyKey: string) => Promise<T>, onRequired: () => void) => withStepUp(request, onRequired),
    []
  )
  return { requireReauth, withReauth }
}
