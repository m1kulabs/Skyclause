// Bundles the Apps Script project into dist/ for `clasp push`; clasp 3 doesn't transpile TypeScript.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { toMytIso } from '../shared/time.ts'

export interface BuildOptions {
  outdir: string
  sha: string
  builtAt: string
  pilotScriptId: string
}

// Returns the entry points written as top-level functions.
export async function build({ outdir, sha, builtAt, pilotScriptId }: BuildOptions): Promise<string[]> {
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, 'src', 'bundle.ts')],
    format: 'iife',
    target: 'browser',
    define: {
      __BUILD_SHA__: JSON.stringify(sha),
      __BUILD_TIME__: JSON.stringify(builtAt),
      __PILOT_SCRIPT_ID__: JSON.stringify(pilotScriptId)
    }
  })
  const [bundle] = result.outputs
  if (!result.success || !bundle) throw new AggregateError(result.logs, 'the Apps Script bundle failed')

  const main: Record<string, unknown> = await import('./src/main.ts')
  const entryPoints = Object.keys(main).filter((name) => typeof main[name] === 'function')
  const stubs = entryPoints.map((name) => `function ${name}(event) {\n  return Skyclause.${name}(event)\n}\n`)

  rmSync(outdir, { recursive: true, force: true })
  mkdirSync(outdir, { recursive: true })
  writeFileSync(join(outdir, 'Code.js'), [await bundle.text(), ...stubs].join('\n'))
  cpSync(join(import.meta.dir, 'appsscript.json'), join(outdir, 'appsscript.json'))
  return entryPoints
}

if (import.meta.main) {
  const sha = process.env.GITHUB_SHA || (await Bun.$`git rev-parse HEAD`.text()).trim()
  const entryPoints = await build({
    outdir: join(import.meta.dir, 'dist'),
    sha,
    builtAt: toMytIso(new Date()),
    pilotScriptId: process.env.PILOT_SCRIPT_ID ?? ''
  })
  console.log(`Built pilot/apps-script/dist at ${sha}: ${entryPoints.join(', ')}`)
}
