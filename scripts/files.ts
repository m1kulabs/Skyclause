import { existsSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const SKIPPED = new Set(['node_modules', '.next', 'dist', '.git', 'test-results', 'playwright-report'])

/** Every file under `dirs` (relative to `root`), as `/`-separated paths relative to `root`, skipping build output. */
export function listFiles(root: string, dirs: string[]): string[] {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIPPED.has(entry.name)) continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile()) files.push(relative(root, path).split(sep).join('/'))
    }
  }
  for (const dir of dirs) if (existsSync(join(root, dir))) walk(join(root, dir))
  return files.sort()
}
