import type { Page } from '@playwright/test'
import type { ApiOperation, ApiRegistry } from '../../lib/api-fetch'

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
  body: unknown,
  options: { registry: Registry }
): Promise<void> {
  const operation = options.registry[operationId]!
  const responseBody = assertValidResponse(operation, body)
  const pattern = routePattern(operation.path)

  await page.route(pattern, async (route) => {
    if (route.request().method().toUpperCase() !== operation.method.toUpperCase()) {
      await route.continue()
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', json: responseBody })
  })
}
