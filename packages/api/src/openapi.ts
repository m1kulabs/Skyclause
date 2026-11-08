import { v1OpenApiDocument } from '@skyclause/contracts'

// TRD "API conventions": OpenAPI 3.1 for `/v1` only, generated from #88's zod route schemas (one generator, in
// contracts), committed as packages/api/openapi.json and served at `/openapi.json`.
export type OpenApiDocument = ReturnType<typeof v1OpenApiDocument>

export const openApiDocument = (): OpenApiDocument => v1OpenApiDocument()

/** The committed form; the file is generated, so prettier skips it. */
export const serializeOpenApi = (document: OpenApiDocument) => `${JSON.stringify(document, null, 2)}\n`

let served: string | undefined

export function openApiResponse(): Response {
  served ??= serializeOpenApi(openApiDocument())
  return new Response(served, { headers: { 'Content-Type': 'application/json' } })
}

// Spec §4: CI fails if a `/v1` operationId names approval, publishing or sending.
const FORBIDDEN = /approve|publish|send/i

/** `openapi:check`'s findings: the committed file has drifted, or `/v1` names a forbidden operation. */
export function checkOpenApi(committed: string, document: OpenApiDocument): string[] {
  const problems: string[] = []
  if (committed !== serializeOpenApi(document)) {
    problems.push('packages/api/openapi.json is out of date: run `bun run openapi:generate` and commit it')
  }
  for (const [path, methods] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(methods as Record<string, { operationId?: string }>)) {
      if (operation.operationId && FORBIDDEN.test(operation.operationId)) {
        problems.push(
          `${method.toUpperCase()} ${path}: operationId ${operation.operationId} names approval, publishing or sending, which /v1 never offers`
        )
      }
    }
  }
  return problems
}
