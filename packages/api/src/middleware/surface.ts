import type { MiddlewareHandler } from 'hono'
import type { ApiEnv } from '../context'
import { ApiError } from '../problems'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Spec §4: `/api` admits only `session` principals (cookie or session bearer) and answers 403 to every other kind;
 * a cookie write must come from `APP_ORIGIN`. A request with no principal passes to the route's own rule.
 */
export const apiSurfaceGate: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const principal = c.get('principal')
  if (principal && principal.kind !== 'session') {
    throw new ApiError(403, 'insufficient-scope', '/api admits only signed-in sessions, never keys or tokens.')
  }
  if (principal?.kind === 'session' && principal.via === 'cookie' && !SAFE_METHODS.has(c.req.method)) {
    const appOrigin = c.get('deps').config().appOrigin
    if (!appOrigin)
      throw new ApiError(403, 'insufficient-scope', 'APP_ORIGIN is not set, so cookie writes are refused.')
    if (c.req.header('Origin') !== new URL(appOrigin).origin) {
      throw new ApiError(403, 'insufficient-scope', 'A cookie write must come from the app origin.')
    }
  }
  await next()
}

/** Spec §1: `Skyclause-Client: mcp; name="…"; tool="…"` on a tool call's first request. */
export function clientTool(header: string | undefined): string | null {
  return header ? (/;\s*tool="([^"]*)"/.exec(header)?.[1] ?? null) : null
}

/**
 * Writes one `mcp.tool_called` for a request naming a tool, in the organisation the request settled on (or the
 * principal's own). Without an organisation there is no tenant to audit in, so nothing is written.
 */
export const auditToolCall: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const tool = clientTool(c.req.header('Skyclause-Client'))
  const principal = c.get('principal')
  const orgId = c.get('orgId') ?? (principal && 'orgId' in principal ? principal.orgId : null)
  if (tool && principal && orgId) {
    const { withTenant, recordAudit } = c.get('deps')
    await withTenant({ orgId, principal }, (tx) =>
      recordAudit(tx, {
        action: 'mcp.tool_called',
        target: { type: 'mcp_tool', id: tool },
        after: { operation_id: c.get('operation').operationId }
      })
    )
  }
  await next()
}
