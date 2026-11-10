import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { expect, test } from 'vitest'

const root = resolve(import.meta.dirname, '../../../..')
const paymentPackage = /^(?:stripe|@stripe\/[^/]+)$/i
const lockPackage = /(?:^|[\s"'{,])(?:stripe|@stripe\/[A-Za-z0-9_.-]+)(?=[@\s"':,}\]])/i
// Installed, built and other checkouts' files; a plain walk keeps the guard free of tools CI images may lack.
const skipped = new Set(['node_modules', '.next', '.git', '.worktrees'])

function manifests(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return skipped.has(entry.name) ? [] : manifests(path)
    return entry.name === 'package.json' || entry.name === 'bun.lock' ? [relative(root, path)] : []
  })
}

test('BIL-1 keeps Stripe dependencies and package names out of the P1 workspace', () => {
  const files = manifests(root)
  const violations: string[] = []

  for (const file of files) {
    const content = readFileSync(resolve(root, file), 'utf8')
    if (file.endsWith('package.json')) {
      const manifest = JSON.parse(content) as Record<string, Record<string, unknown> | undefined>
      for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        for (const name of Object.keys(manifest[field] ?? {})) {
          if (paymentPackage.test(name)) violations.push(`${file}: ${name}`)
        }
      }
    } else if (file === 'bun.lock' || file.endsWith('/bun.lock')) {
      for (const [index, line] of content.split('\n').entries()) {
        if (lockPackage.test(line)) violations.push(`${file}:${index + 1}: ${line.trim()}`)
      }
    }
  }

  expect(violations).toEqual([])
})
