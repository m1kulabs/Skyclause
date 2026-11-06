// Builds the camera page into dist/ for the public bucket. CAMERA_TOKEN is pasted on the phone, never built in:
// config.json carries only the public /exec URL as a setup convenience, and app.js is bundled from app.ts.
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const EXEC_URL = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/

export function checkIngestUrl(ingestUrl: string): void {
  if (!EXEC_URL.test(ingestUrl)) {
    throw new Error(
      `INGEST_URL must be the web app's https://script.google.com/macros/s/<id>/exec URL, got "${ingestUrl}"`
    )
  }
}

export async function buildCamera({ outdir, ingestUrl }: { outdir: string; ingestUrl: string }) {
  checkIngestUrl(ingestUrl)
  rmSync(outdir, { recursive: true, force: true })
  mkdirSync(outdir, { recursive: true })
  writeFileSync(join(outdir, 'config.json'), `${JSON.stringify({ ingest_url: ingestUrl })}\n`)
  copyFileSync(join(import.meta.dir, 'index.html'), join(outdir, 'index.html'))
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, 'app.ts')],
    format: 'iife',
    target: 'browser'
  })
  const [bundle] = result.outputs
  if (!result.success || !bundle) throw new AggregateError(result.logs, 'the camera page bundle failed')
  writeFileSync(join(outdir, 'app.js'), await bundle.text())
}

if (import.meta.main) {
  await buildCamera({ outdir: join(import.meta.dir, 'dist'), ingestUrl: process.env.INGEST_URL ?? '' })
  console.log('Built pilot/camera/dist')
}
