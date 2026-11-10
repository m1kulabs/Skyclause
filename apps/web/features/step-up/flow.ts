'use client'

import { ApiProblem } from '../../lib/api-fetch'

export class ReauthCancelledError extends Error {
  constructor() {
    super('Step-up cancelled')
    this.name = 'ReauthCancelledError'
  }
}

interface PendingStepUp {
  promise: Promise<void>
  resolve: () => void
  reject: (reason: unknown) => void
}

let pending: PendingStepUp | undefined
let returnFocus: HTMLElement | null | undefined

function captureFocus() {
  if (returnFocus !== undefined) return
  returnFocus = typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)
}

function restoreFocus() {
  const target = returnFocus
  returnFocus = undefined
  if (target) setTimeout(() => target.isConnected && target.focus(), 0)
}

export function requireStepUp(): Promise<void> {
  if (pending) return pending.promise
  captureFocus()
  let resolve!: () => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<void>((accept, decline) => {
    resolve = accept
    reject = decline
  })
  pending = { promise, resolve, reject }
  return promise
}

export function completeStepUp() {
  const current = pending
  pending = undefined
  current?.resolve()
  restoreFocus()
}

export function cancelStepUp() {
  const current = pending
  pending = undefined
  current?.reject(new ReauthCancelledError())
  restoreFocus()
}

export function isReauthRequired(error: unknown): error is ApiProblem {
  if (!(error instanceof ApiProblem) || error.status !== 401) return false
  const typeCode = error.body.type?.split('/').pop()
  return typeCode === 'reauth-required' || error.body.code === 'reauth-required'
}

export async function withStepUp<T>(
  request: (idempotencyKey: string) => Promise<T>,
  onRequired: () => void
): Promise<T> {
  const idempotencyKey = globalThis.crypto.randomUUID()
  if (!pending) captureFocus()
  try {
    return await request(idempotencyKey)
  } catch (error) {
    if (!isReauthRequired(error)) throw error
    const confirmation = requireStepUp()
    onRequired()
    await confirmation
    return request(idempotencyKey)
  } finally {
    if (!pending) returnFocus = undefined
  }
}
