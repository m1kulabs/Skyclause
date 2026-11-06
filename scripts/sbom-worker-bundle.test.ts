import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { plantRepo } from './test-helpers'

const script = fileURLToPath(new URL('./sbom-worker-bundle.ts', import.meta.url))
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

const ROOT = 'SPDXRef-DocumentRoot-Image-app'

// The parts of syft's SPDX 2.3 image document the script relies on: the image package the document describes.
const syftDocument = () => ({
  spdxVersion: 'SPDX-2.3',
  SPDXID: 'SPDXRef-DOCUMENT',
  packages: [{ name: 'app', SPDXID: ROOT, primaryPackagePurpose: 'CONTAINER' }],
  relationships: [{ spdxElementId: 'SPDXRef-DOCUMENT', relatedSpdxElement: ROOT, relationshipType: 'DESCRIBES' }]
})

interface SpdxPackage {
  name: string
  SPDXID: string
  versionInfo?: string
  externalRefs?: { referenceType: string; referenceLocator: string }[]
}

interface SpdxDocument {
  packages: SpdxPackage[]
  relationships: { spdxElementId: string; relatedSpdxElement: string; relationshipType: string }[]
}

function merge(files: { meta: string; lock: string }) {
  const dir = plantRepo({ 'sbom.spdx.json': JSON.stringify(syftDocument()) })
  const sbom = join(dir, 'sbom.spdx.json')
  const result = spawnSync('bun', [script, sbom, files.meta, files.lock], { encoding: 'utf8' })
  return { ...result, sbom: JSON.parse(readFileSync(sbom, 'utf8')) as SpdxDocument }
}

// Real data: the worker's own build script, whose metafile the image carries, merged with the repository's bun.lock.
test("the worker bundle's packages join the SBOM with their bun.lock versions", { timeout: 60_000 }, () => {
  const worker = join(repoRoot, 'apps/worker')
  const build = spawnSync('bun', ['run', 'build'], { cwd: worker, encoding: 'utf8' })
  expect(build.status, build.stderr).toBe(0)

  const result = merge({ meta: join(worker, 'dist/meta.json'), lock: join(repoRoot, 'bun.lock') })
  expect(result.stderr).toBe('')
  expect(result.status).toBe(0)

  // apps/worker/package.json pins exact versions, which bun.lock resolves to.
  const pinned = JSON.parse(readFileSync(join(repoRoot, 'apps/worker/package.json'), 'utf8')).dependencies
  const purls = { hono: 'pkg:npm/hono@', '@hono/node-server': 'pkg:npm/%40hono/node-server@', jose: 'pkg:npm/jose@' }
  for (const [name, purl] of Object.entries(purls)) {
    const pkg = result.sbom.packages.find((candidate) => candidate.name === name)
    expect(pkg?.versionInfo, name).toBe(pinned[name])
    expect(pkg?.externalRefs?.find((ref) => ref.referenceType === 'purl')?.referenceLocator).toBe(purl + pinned[name])
    expect(result.sbom.relationships).toContainEqual({
      spdxElementId: ROOT,
      relatedSpdxElement: pkg?.SPDXID,
      relationshipType: 'CONTAINS'
    })
    expect(result.stdout).toContain(`${name}@${pinned[name]}\n`)
  }
  // Workspace packages are this repository's own code, not npm packages.
  expect(result.sbom.packages.map((pkg) => pkg.name)).not.toContain('@skyclause/config')
  for (const pkg of result.sbom.packages) expect(pkg.SPDXID).toMatch(/^SPDXRef-[A-Za-z0-9.-]+$/)
})

// A metafile whose one output inlines the given inputs, each contributing some bytes.
const metafile = (...inputs: string[]) =>
  JSON.stringify({
    outputs: { './main.js': { inputs: Object.fromEntries(inputs.map((path) => [path, { bytesInOutput: 10 }])) } }
  })

// bun.lock is JSONC: trailing commas included.
const lockfile = (...resolutions: [key: string, resolution: string][]) =>
  `{\n  "lockfileVersion": 1,\n  "packages": {\n${resolutions.map(([key, resolution]) => `    "${key}": ["${resolution}", "", {}, "sha512-x"],\n`).join('')}  },\n}\n`

test('fails naming a bundled package that bun.lock has no matching version of', () => {
  const files = plantRepo({
    'meta.json': metafile(
      '../../node_modules/.bun/hono@4.13.16/node_modules/hono/dist/index.js',
      '../../node_modules/.bun/left-pad@1.3.0/node_modules/left-pad/index.js'
    ),
    'bun.lock': lockfile(['hono', 'hono@4.13.16'], ['left-pad', 'left-pad@1.2.0'])
  })
  const result = merge({ meta: join(files, 'meta.json'), lock: join(files, 'bun.lock') })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('left-pad: bundled from ../../node_modules/.bun/left-pad@1.3.0/')
  expect(result.stderr).not.toContain('hono')
})

test("Bun's store directory picks the version when bun.lock holds several", () => {
  const files = plantRepo({
    'meta.json': metafile(
      '../../node_modules/.bun/@scope+pkg@2.0.0+0123456789abcdef/node_modules/@scope/pkg/index.js',
      '../../packages/config/src/index.ts'
    ),
    'bun.lock': lockfile(['@scope/pkg', '@scope/pkg@1.0.0'], ['other/@scope/pkg', '@scope/pkg@2.0.0'])
  })
  const result = merge({ meta: join(files, 'meta.json'), lock: join(files, 'bun.lock') })
  expect(result.stderr).toBe('')
  expect(result.stdout).toBe('@scope/pkg@2.0.0\n')
  expect(result.sbom.packages.filter((pkg) => pkg.name === '@scope/pkg').map((pkg) => pkg.versionInfo)).toEqual([
    '2.0.0'
  ])
})
