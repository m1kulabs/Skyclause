import { SIGN_IN_LINK_EXPIRY_S } from '@skyclause/auth/sign-in-link'

const APP_ORIGIN = 'https://app.skyclause.m1ku.tech'
/** An emailed link's lifetime, from the constant the server sets it with. */
export const LINK_LIFETIME_MS = SIGN_IN_LINK_EXPIRY_S * 1000

export const AUTH_ROUTE_PATHS = [
  '/sign-in',
  '/sign-up',
  '/guest',
  '/device',
  '/oauth/consent',
  '/invite/[token]'
] as const

export const AUTH_REAUTH_DIALOG_SELECTOR = '[data-auth-reauth-dialog]'

export type AuthSearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export function safeNext(value: string | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null
  try {
    const resolved = new URL(value, APP_ORIGIN)
    return resolved.origin === APP_ORIGIN ? `${resolved.pathname}${resolved.search}${resolved.hash}` : null
  } catch {
    return null
  }
}

export function continuePath(next: string | null | undefined): string {
  const url = new URL('/api/auth/continue', APP_ORIGIN)
  const safe = safeNext(next ?? undefined)
  if (safe) url.searchParams.set('next', safe)
  return `${url.pathname}${url.search}`
}

export function accountPath(path: '/sign-in' | '/sign-up', next: string | null | undefined): string {
  const url = new URL(path, APP_ORIGIN)
  const safe = safeNext(next ?? undefined)
  if (safe) url.searchParams.set('next', safe)
  return `${url.pathname}${url.search}`
}

export function isAuthRoute(path: string): boolean {
  return AUTH_ROUTE_PATHS.some((route) => {
    if (route === '/invite/[token]') return /^\/invite\/[^/]+$/.test(path)
    return route === path
  })
}

export type AuthState =
  | { kind: 'confirm'; link: string; resend?: string; stepUp: boolean }
  | { kind: 'expired'; resend?: string; stepUp?: boolean; resendFailed?: boolean }
  | { kind: 'link-pending' }
  | { kind: 'google-failed' }
  // The form posted without JavaScript (form-post.ts) says what happened through these.
  | { kind: 'link-sent'; until: string }
  // `email` is the address the form posted, put back in the field so nobody retypes it.
  | { kind: 'email-invalid'; email?: string }
  | { kind: 'send-failed'; email?: string }
  | { kind: 'send-limited'; retryAt?: string; email?: string }
  | { kind: 'step-up-confirmed' }
  | { kind: 'form' }

/** An address with one @, something on both sides and a dot in the domain; the server checks it again. */
export function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function instant(value: string | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * A sent link's end, from the URL the no-script form lands on. It is only a picture of the link's window, never a
 * credential, so an end beyond one link's lifetime from now is ignored rather than drawn.
 */
function linkEnd(value: string | undefined, now: Date): string | null {
  const until = instant(value)
  if (!until || until.getTime() > now.getTime() + LINK_LIFETIME_MS + 60_000) return null
  return until.toISOString()
}

/** The address a refused no-script post carries back: only ever a field's value, at most an address's length. */
function postedEmail(params: AuthSearchParams): { email?: string } {
  const email = first(params.email)?.trim()
  return email && email.length <= 254 ? { email } : {}
}

export function resolveAuthState(params: AuthSearchParams, now: Date = new Date()): AuthState {
  const link = first(params.link)
  const stepUp = first(params.for) === 'step-up'
  if (link !== undefined) {
    const resend = first(params.resend)
    return { kind: 'confirm', link, ...(resend ? { resend } : {}), stepUp }
  }

  const state = first(params.state)
  if (state === 'link-expired') {
    const resend = first(params.resend)
    return {
      kind: 'expired',
      ...(resend ? { resend } : {}),
      ...(stepUp ? { stepUp: true } : {}),
      ...(first(params.failed) === 'resend' ? { resendFailed: true } : {})
    }
  }
  if (state === 'link-pending') return { kind: 'link-pending' }
  if (state === 'google-failed') return { kind: 'google-failed' }
  if (state === 'link-sent') {
    const until = linkEnd(first(params.until), now)
    return until ? { kind: 'link-sent', until } : { kind: 'form' }
  }
  if (state === 'email-invalid') return { kind: 'email-invalid', ...postedEmail(params) }
  if (state === 'step-up-confirmed') return { kind: 'step-up-confirmed' }
  if (state === 'send-failed') return { kind: 'send-failed', ...postedEmail(params) }
  if (state === 'send-limited') {
    const retryAt = instant(first(params.retry))?.toISOString()
    return { kind: 'send-limited', ...(retryAt ? { retryAt } : {}), ...postedEmail(params) }
  }
  return { kind: 'form' }
}
