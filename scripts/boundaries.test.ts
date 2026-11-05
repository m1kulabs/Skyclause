import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { checkBoundaries } from './boundaries'
import { plantRepo } from './test-helpers'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

interface Unit {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  references?: string[]
  files?: Record<string, string>
}

/** A repository with the given units, e.g. `{ 'packages/db': { files: { 'src/index.ts': '…' } } }`. */
function repo(units: Record<string, Unit>) {
  const files: Record<string, string> = {}
  for (const [dir, unit] of Object.entries(units)) {
    const name = `@skyclause/${dir.split('/')[1]}`
    files[`${dir}/package.json`] = JSON.stringify({
      name,
      dependencies: unit.dependencies,
      devDependencies: unit.devDependencies
    })
    files[`${dir}/tsconfig.json`] = JSON.stringify({ references: (unit.references ?? []).map((path) => ({ path })) })
    for (const [path, content] of Object.entries(unit.files ?? { 'src/index.ts': 'export {}\n' }))
      files[`${dir}/${path}`] = content
  }
  return plantRepo(files)
}

describe('dependency boundaries (spec §1, D10)', () => {
  test('the repository itself is clean', () => {
    expect(checkBoundaries(repoRoot)).toEqual([])
  })

  test('dependencies inside the §1 cells pass', () => {
    const root = repo({
      'packages/db': {
        dependencies: { '@skyclause/contracts': 'workspace:*' },
        references: ['../contracts'],
        files: { 'src/index.ts': "import { x } from '@skyclause/contracts'\n" }
      },
      'packages/contracts': {},
      'apps/web': {
        dependencies: { '@skyclause/db': 'workspace:*' },
        references: ['../../packages/db'],
        files: { 'lib/db.ts': "export * from '@skyclause/db'\n" }
      }
    })
    expect(checkBoundaries(root)).toEqual([])
  })

  test('a package importing an app fails', () => {
    const root = repo({
      'packages/db': { files: { 'src/index.ts': "import { page } from '@skyclause/web'\n" } },
      'apps/web': {}
    })
    expect(checkBoundaries(root)).toEqual([
      'packages/db/src/index.ts imports app @skyclause/web; apps depend on packages, never the reverse'
    ])
  })

  test('a package importing an app by relative path fails', () => {
    const root = repo({
      'packages/db': { files: { 'src/index.ts': "import '../../../apps/web/lib/db'\n" } },
      'apps/web': {}
    })
    expect(checkBoundaries(root)).toEqual([
      'packages/db/src/index.ts imports app @skyclause/web; apps depend on packages, never the reverse'
    ])
  })

  test('a dependency outside the §1 cell fails, in package.json or in an import', () => {
    const root = repo({
      'packages/delivery': { files: { 'src/index.ts': "export { withTenant } from '@skyclause/db'\n" } },
      'packages/clauses': { dependencies: { '@skyclause/contracts': 'workspace:*' } },
      'packages/db': {},
      'packages/contracts': {}
    })
    expect(checkBoundaries(root)).toEqual([
      'packages/clauses/package.json depends on @skyclause/contracts, outside its §1 cell',
      'packages/delivery/src/index.ts imports @skyclause/db, outside its §1 cell'
    ])
  })

  test('a type-only cell refuses a value import', () => {
    const root = repo({
      'packages/cli': {
        files: {
          'src/a.ts': "import type { Principal } from '@skyclause/contracts'\n",
          'src/b.ts': "import { notBuilt } from '@skyclause/contracts'\n"
        }
      },
      'packages/contracts': {}
    })
    expect(checkBoundaries(root)).toEqual([
      'packages/cli/src/b.ts imports @skyclause/contracts, which its §1 cell allows only as import type'
    ])
  })

  test('packages/clauses depends on @bufbuild/cel only', () => {
    const root = repo({
      'packages/clauses': {
        dependencies: { '@bufbuild/cel': '0.6.2', zod: '4.6.7' },
        devDependencies: { vitest: '5.1.0' },
        files: {
          'src/index.ts': "import { run } from '@bufbuild/cel'\nimport { createHash } from 'node:crypto'\n",
          'test/a.test.ts': "import { test } from 'vitest'\n"
        }
      }
    })
    expect(checkBoundaries(root)).toEqual([
      'packages/clauses/package.json depends on zod; packages/clauses may depend on @bufbuild/cel only',
      'packages/clauses/src/index.ts imports node:crypto; packages/clauses may depend on @bufbuild/cel only'
    ])
  })

  test('an import of pilot/ fails (D10)', () => {
    const root = repo({
      'packages/sources': { files: { 'src/index.ts': "import { parse } from '../../../pilot/shared/readings'\n" } }
    })
    expect(checkBoundaries(root)).toEqual(['packages/sources/src/index.ts imports pilot/ (D10)'])
  })

  test('repository scripts and root configs importing pilot/ fail (D10)', () => {
    const root = plantRepo({
      'scripts/sync.ts': "import { schema } from '../pilot/apps-script/src/schema'\n",
      'vitest.config.mts': "import '../pilot/x'\nimport './pilot/apps-script/build'\n"
    })
    expect(checkBoundaries(root)).toEqual([
      'scripts/sync.ts imports pilot/ (D10)',
      'vitest.config.mts imports pilot/ (D10)'
    ])
  })

  test('a project reference into pilot/ fails (D10)', () => {
    const root = repo({ 'apps/worker': { references: ['../../pilot'] } })
    expect(checkBoundaries(root)).toEqual(['apps/worker/tsconfig.json references pilot/ (D10)'])
  })

  test('project references forming a cycle fail', () => {
    const root = repo({
      'packages/contracts': { references: ['../sources'] },
      'packages/sources': { references: ['../contracts'] }
    })
    expect(checkBoundaries(root)).toEqual([
      'project references form a cycle: packages/contracts → packages/sources → packages/contracts'
    ])
  })

  test('a unit missing from the §1 module map fails', () => {
    expect(checkBoundaries(repo({ 'packages/sdk-python': {}, 'apps/admin': {} }))).toEqual([
      'apps/admin is not in the §1 module map',
      'packages/sdk-python is not in the §1 module map'
    ])
  })
})
