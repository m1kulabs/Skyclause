import { existsSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const SOURCE = /\.[cm]?[jt]sx?$/

export const isSource = (file: string) => SOURCE.test(file)
/** Test and e2e files: doubles and selectors live there, never shipped code. */
export const isTestFile = (file: string) => /(^|\/)(test|e2e)\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)
export const toPosix = (path: string) => path.split(sep).join('/')

const SKIPPED = new Set(['node_modules', '.next', 'dist', '.git', 'test-results', 'playwright-report'])

/** Every file under `dirs` (relative to `root`), as `/`-separated paths relative to `root`, skipping build output. */
export function listFiles(root: string, dirs: string[]): string[] {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIPPED.has(entry.name)) continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile()) files.push(toPosix(relative(root, path)))
    }
  }
  for (const dir of dirs) if (existsSync(join(root, dir))) walk(join(root, dir))
  return files.sort()
}
