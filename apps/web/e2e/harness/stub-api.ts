import type { Page, Request } from '@playwright/test'
import type { ApiOperation, ApiRegistry } from '../../lib/api-fetch'

type ResponseResolver = (request: Request) => unknown | Promise<unknown>

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function routePattern(path: string): RegExp {
  const pattern = path
    .split('/')
    .map((segment) => (/^\{[^/{}]+\}$/.test(segment) ? '[^/]+' : escapeRegex(segment)))
    .join('/')
  return new RegExp(`${pattern}(?:\\?[^#]*)?$`)
}

/** Parse a stub body with the operation's response schema or throw its validation error. */
export function assertValidResponse<Operation extends ApiOperation>(operation: Operation, body: unknown) {
  return operation.response.parse(body)
}

export async function stubApi<Registry extends ApiRegistry, OperationId extends keyof Registry & string>(
  page: Page,
  operationId: OperationId,
  body: unknown | ResponseResolver,
  options: {
    registry: Registry
    stream?: { event: string; id?: string }
    query?: Record<string, string | null>
    status?: number
  }
): Promise<void> {
  const operation = options.registry[operationId]!
  const status = options.status ?? 200
  const responseBody = typeof body === 'function' || status >= 400 ? undefined : assertValidResponse(operation, body)
  const pattern = routePattern(operation.path)

  await page.route(pattern, async (route) => {
    const query = new URL(route.request().url()).searchParams
    if (options.query && Object.entries(options.query).some(([key, value]) => query.get(key) !== value)) {
      await route.fallback()
      return
    }
    if (route.request().method().toUpperCase() !== operation.method.toUpperCase()) {
      await route.fallback()
      return
    }
    const rawBody = typeof body === 'function' ? await (body as ResponseResolver)(route.request()) : body
    const resolvedBody =
      status >= 400 ? rawBody : typeof body === 'function' ? assertValidResponse(operation, rawBody) : responseBody
    if (options.stream) {
      const { event, id } = options.stream
      await route.fulfill({
        status,
        contentType: 'text/event-stream',
        body: `${id ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(resolvedBody)}\n\n`
      })
    } else {
      if (resolvedBody === undefined && status === 200) await route.fulfill({ status: 204 })
      else await route.fulfill({ status, contentType: 'application/json', json: resolvedBody })
    }
  })
}
