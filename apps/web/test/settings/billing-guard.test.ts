import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

const root = resolve(import.meta.dirname, '../../../..')
const paymentPackage = /^(?:stripe|@stripe\/[^/]+)$/i
const lockPackage = /(?:^|[\s"'{,])(?:stripe|@stripe\/[A-Za-z0-9_.-]+)(?=[@\s"':,}\]])/i

test('BIL-1 keeps Stripe dependencies and package names out of the P1 workspace', () => {
  const files = execFileSync(
    'rg',
    ['--files', '--hidden', '-g', 'package.json', '-g', 'bun.lock', '-g', '!**/node_modules/**', '-g', '!**/.next/**'],
    { cwd: root, encoding: 'utf8' }
  )
    .split('\n')
    .filter(Boolean)
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
