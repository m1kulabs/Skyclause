// `sbom-worker-bundle.ts <sbom.spdx.json> <meta.json> <bun.lock>` (#227): syft lists the image's Debian packages and
// web's node_modules, but not the npm packages `bun build` inlined into apps/worker/dist/main.js. This reads the
// bundle's metafile, takes each inlined package's version from bun.lock, adds the packages to syft's SPDX document
// as contained in the image, and prints them as `name@version`. A bundled package bun.lock doesn't name fails it.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

interface Metafile {
  outputs: Record<string, { inputs: Record<string, { bytesInOutput: number }> }>
}

interface Lockfile {
  packages: Record<string, [string, ...unknown[]]>
}

interface SpdxDocument {
  packages: object[]
  relationships: { spdxElementId: string; relatedSpdxElement: string; relationshipType: string }[]
}

const [sbomPath, metaPath, lockPath] = process.argv.slice(2)
if (!sbomPath || !metaPath || !lockPath) {
  console.error('usage: sbom-worker-bundle.ts <sbom.spdx.json> <meta.json> <bun.lock>')
  process.exit(2)
}

const sbom = JSON.parse(readFileSync(sbomPath, 'utf8')) as SpdxDocument
const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as Metafile
// bun.lock is JSON with trailing commas; none of its strings (names, ranges, integrity hashes) hold a `,]` or `,}`.
const lock = JSON.parse(readFileSync(lockPath, 'utf8').replace(/,(\s*[\]}])/g, '$1')) as Lockfile

// Every version bun.lock resolves each package name to (`"<name>@<version>"`; nested keys such as `cliui/string-width`
// hold other versions, or the same one again).
const locked = new Map<string, Set<string>>()
for (const [resolution] of Object.values(lock.packages)) {
  const versionAt = resolution.lastIndexOf('@')
  const name = resolution.slice(0, versionAt)
  locked.set(name, (locked.get(name) ?? new Set()).add(resolution.slice(versionAt + 1)))
}

// An input such as `../../node_modules/.bun/@hono+node-server@2.1.6+<peer hash>/node_modules/@hono/node-server/…`:
// the package is the path after the last node_modules/, and Bun's store directory before it pins the version.
const bundled = new Map<string, { name: string; version: string }>()
const problems = new Map<string, string>()
for (const output of Object.values(meta.outputs)) {
  for (const [path, { bytesInOutput }] of Object.entries(output.inputs)) {
    const modules = path.lastIndexOf('node_modules/')
    if (modules === -1 || bytesInOutput === 0) continue
    const name = /^((?:@[^/]+\/)?[^/]+)\//.exec(path.slice(modules + 'node_modules/'.length))?.[1]
    if (!name) continue
    const store = /\.bun\/([^/]+)\/$/.exec(path.slice(0, modules))?.[1]
    const storeVersion = store?.slice(name.replace('/', '+').length + 1).replace(/\+[0-9a-f]{16}$/, '')
    const candidates = [...(locked.get(name) ?? [])].filter((version) => !storeVersion || version === storeVersion)
    const [version] = candidates
    if (version && candidates.length === 1) bundled.set(`${name}@${version}`, { name, version })
    else problems.set(name, `${name}: bundled from ${path}, but bun.lock has ${candidates.length} matching versions`)
  }
}
if (problems.size) {
  for (const problem of problems.values()) console.error(problem)
  process.exit(1)
}

const root = sbom.relationships.find((relationship) => relationship.relationshipType === 'DESCRIBES')
if (!root) {
  console.error(`${sbomPath}: no DESCRIBES relationship names the image`)
  process.exit(1)
}

for (const [id, { name, version }] of [...bundled].sort()) {
  // syft's ID shape, SPDXRef-Package-npm-<name, other characters as -><hash>, which SPDX limits to [A-Za-z0-9.-].
  const hash = createHash('sha256').update(`worker-bundle:${id}`).digest('hex').slice(0, 16)
  const spdxId = `SPDXRef-Package-npm-${name.replace(/[^A-Za-z0-9.-]/g, '-')}-${hash}`
  sbom.packages.push({
    name,
    SPDXID: spdxId,
    versionInfo: version,
    supplier: 'NOASSERTION',
    downloadLocation: 'NOASSERTION',
    filesAnalyzed: false,
    sourceInfo: 'inlined into /app/apps/worker/dist/main.js by bun build; version from bun.lock',
    licenseConcluded: 'NOASSERTION',
    licenseDeclared: 'NOASSERTION',
    copyrightText: 'NOASSERTION',
    externalRefs: [
      {
        referenceCategory: 'PACKAGE-MANAGER',
        referenceType: 'purl',
        referenceLocator: `pkg:npm/${name.replace('@', '%40')}@${version}`
      }
    ]
  })
  sbom.relationships.push({
    spdxElementId: root.relatedSpdxElement,
    relatedSpdxElement: spdxId,
    relationshipType: 'CONTAINS'
  })
  console.log(id)
}
writeFileSync(sbomPath, JSON.stringify(sbom))
