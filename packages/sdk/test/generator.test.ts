import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { OPENAPI_SHA256 } from '../src/generated'
import { generateSdkFiles } from '../scripts/generate'

const packageRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const openapiPath = resolve(packageRoot, '../api/openapi.json')

it('regenerates the committed OpenAPI client output in memory without drift', async () => {
  const source = await readFile(openapiPath, 'utf8')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))
  const expectedHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const generated = await generateSdkFiles(source)

  expect(OPENAPI_SHA256).toBe(expectedHash)

  for (const [relativePath, expected] of Object.entries(generated)) {
    expect(await readFile(resolve(packageRoot, relativePath), 'utf8'), relativePath).toBe(expected)
  }

  const committedOperationSchemas = await readdir(resolve(packageRoot, 'openapi/schemas'))
  const generatedOperationSchemas = Object.keys(generated)
    .filter((path) => path.startsWith('openapi/schemas/'))
    .map((path) => path.slice('openapi/schemas/'.length))
    .sort()
  expect(committedOperationSchemas.sort()).toEqual(generatedOperationSchemas)
})

it('requires a CHANGELOG entry and at least six months before every deprecated operation sunset', async () => {
  const source = await readFile(openapiPath, 'utf8')
  const document = JSON.parse(source) as {
    paths: Record<string, Record<string, { operationId?: string; deprecated?: boolean }>>
  }
  const changelog = await readFile(resolve(packageRoot, 'CHANGELOG.md'), 'utf8')
  const entries = new Map<string, { deprecatedAt: string; sunsetAt: string }>()

  for (const match of changelog.matchAll(
    /^- `([^`]+)`: deprecated `(\d{4}-\d{2}-\d{2})`; sunset `(\d{4}-\d{2}-\d{2})`\.$/gm
  )) {
    entries.set(match[1]!, { deprecatedAt: match[2]!, sunsetAt: match[3]! })
  }

  const deprecated = Object.values(document.paths)
    .flatMap((path) => Object.values(path))
    .filter((operation) => operation.deprecated)

  for (const operation of deprecated) {
    expect(operation.operationId).toBeDefined()
    const entry = entries.get(operation.operationId!)
    expect(entry, `CHANGELOG.md entry for ${operation.operationId}`).toBeDefined()
    const earliestSunset = new Date(`${entry!.deprecatedAt}T00:00:00Z`)
    earliestSunset.setUTCMonth(earliestSunset.getUTCMonth() + 6)
    expect(new Date(`${entry!.sunsetAt}T00:00:00Z`).getTime()).toBeGreaterThanOrEqual(earliestSunset.getTime())
  }
})
