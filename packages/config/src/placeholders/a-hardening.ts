import { notBuilt } from '@skyclause/contracts'

export type AssertPublicUrl = (url: string | URL, o?: { https?: boolean }) => Promise<{ url: URL; addresses: string[] }>
export type SafeFetch = (
  url: string | URL,
  init?: RequestInit & {
    timeoutMs?: number
    maxBytes?: number
    redirects?: 'error' | 'follow'
    maxRedirects?: number
  }
) => Promise<Response>

export const assertPublicUrl: AssertPublicUrl = notBuilt('a-hardening')
export const safeFetch: SafeFetch = notBuilt('a-hardening')
