import { ApiProblem } from '../../lib/api-fetch'

export interface AccountAuthError extends Error {
  code?: string
  status?: number
}

export function authError(code: string, status: number, message: string): AccountAuthError {
  return Object.assign(new Error(message), { code, status })
}

export function isProblem(error: unknown, code: string): boolean {
  if (error instanceof ApiProblem) return error.body.code === code || error.body.type?.split('/').at(-1) === code
  if (typeof error !== 'object' || error === null) return false
  const found = error as { code?: unknown; body?: { code?: unknown; type?: unknown } }
  return (
    found.code === code ||
    found.body?.code === code ||
    (typeof found.body?.type === 'string' && found.body.type.split('/').at(-1) === code)
  )
}

export async function authRequest<T>(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown } = {}
): Promise<T> {
  const response = await fetch(`/api/auth${path}`, {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    headers:
      options.body === undefined
        ? { Accept: 'application/json' }
        : { Accept: 'application/json', 'Content-Type': 'application/json' },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
  })
  const data: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    const body = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
    throw authError(
      String(body.code ?? (typeof body.type === 'string' ? body.type.split('/').at(-1) : 'request-failed')),
      response.status,
      String(body.message ?? body.detail ?? response.statusText ?? 'The request failed.')
    )
  }
  return data as T
}

export function unwrapAuthResult<T>(result: {
  data: T | null | undefined
  error: { code?: string; status: number; message?: string } | null
}): T {
  if (result.error)
    throw authError(
      result.error.code ?? 'request-failed',
      result.error.status,
      result.error.message ?? 'The request failed.'
    )
  if (result.data == null) throw authError('request-failed', 500, 'The request did not return account data.')
  return result.data
}
