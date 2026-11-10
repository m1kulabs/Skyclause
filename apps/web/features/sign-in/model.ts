const APP_ORIGIN = 'https://app.skyclause.m1ku.tech'

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
  | { kind: 'expired'; resend?: string; stepUp?: boolean }
  | { kind: 'link-pending' }
  | { kind: 'google-failed' }
  | { kind: 'form' }

export function resolveAuthState(params: AuthSearchParams): AuthState {
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
      ...(stepUp ? { stepUp: true } : {})
    }
  }
  if (state === 'link-pending') return { kind: 'link-pending' }
  if (state === 'google-failed') return { kind: 'google-failed' }
  return { kind: 'form' }
}
