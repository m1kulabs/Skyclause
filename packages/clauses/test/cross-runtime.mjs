import { execFileSync } from 'node:child_process'
import console from 'node:console'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import { chromium } from '@playwright/test'

const node = process.env.CANONICAL_HASH_NODE ?? process.execPath
const version = execFileSync(node, ['--version'], { encoding: 'utf8' }).trim()
if (!version.startsWith('v22.')) throw new Error('Set CANONICAL_HASH_NODE to a Node 22 executable')
const directory = await mkdtemp(join(tmpdir(), 'clauses-hash-'))
try {
  const bundle = join(directory, 'hash-vectors.mjs')
  // Browser targeting rejects Node built-ins; the same self-contained ESM runs in every runtime.
  execFileSync(
    'bun',
    [
      'build',
      fileURLToPath(new URL('./runtime-entry.ts', import.meta.url)),
      '--target=browser',
      '--format=esm',
      `--outfile=${bundle}`
    ],
    { stdio: 'inherit' }
  )
  const expected = execFileSync(node, [bundle], { encoding: 'utf8' }).trim()
  console.log(`Node ${version}: ${expected}`)
  const bun = execFileSync('bun', [bundle], { encoding: 'utf8' }).trim()
  if (bun !== expected) throw new Error(`Bun disagrees: ${bun}`)
  console.log(`Bun ${execFileSync('bun', ['--version'], { encoding: 'utf8' }).trim()}: ${bun}`)
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const source = await readFile(bundle)
    const result = await page.evaluate(
      async (url) => (await import(url)).result,
      `data:text/javascript;base64,${source.toString('base64')}`
    )
    if (JSON.stringify(result) !== expected) throw new Error(`Chromium disagrees: ${JSON.stringify(result)}`)
    console.log(`Chromium ${browser.version()}: ${JSON.stringify(result)}`)
  } finally {
    await browser.close()
  }
} finally {
  await rm(directory, { recursive: true, force: true })
}
