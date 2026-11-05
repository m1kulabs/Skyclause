// Builds the camera page into dist/ for the public bucket. CAMERA_TOKEN is pasted on the phone, never built in.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const EXEC_URL = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/

export function buildCamera({ outdir, ingestUrl }: { outdir: string; ingestUrl: string }) {
  if (!EXEC_URL.test(ingestUrl)) {
    throw new Error(
      `INGEST_URL must be the web app's https://script.google.com/macros/s/<id>/exec URL, got "${ingestUrl}"`
    )
  }
  rmSync(outdir, { recursive: true, force: true })
  mkdirSync(outdir, { recursive: true })
  writeFileSync(join(outdir, 'config.json'), `${JSON.stringify({ ingest_url: ingestUrl })}\n`)
}

if (import.meta.main) {
  buildCamera({ outdir: join(import.meta.dir, 'dist'), ingestUrl: process.env.INGEST_URL ?? '' })
  console.log('Built pilot/camera/dist')
}
