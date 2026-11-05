import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/** A throwaway repository root holding the given files. */
export function plantRepo(files: Record<string, string | Uint8Array>) {
  const root = mkdtempSync(join(tmpdir(), 'skyclause-scripts-'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}
