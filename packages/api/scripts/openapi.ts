// `openapi:generate` (`--write`) and `openapi:check`: TRD "API conventions" makes CI fail when the committed
// document drifts from the route schemas, and spec §4 when a /v1 operationId names approval, publishing or sending.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { checkOpenApi, openApiDocument, serializeOpenApi } from '../src/openapi'

const file = fileURLToPath(new URL('../openapi.json', import.meta.url))
const document = openApiDocument()

if (process.argv.includes('--write')) {
  writeFileSync(file, serializeOpenApi(document))
  console.log('wrote packages/api/openapi.json')
} else {
  const problems = checkOpenApi(existsSync(file) ? readFileSync(file, 'utf8') : '', document)
  for (const problem of problems) console.error(problem)
  if (!problems.length) console.log('packages/api/openapi.json matches the route schemas')
  process.exitCode = problems.length ? 1 : 0
}
