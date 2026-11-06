import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildCamera } from './build.ts'

let root = ''
let outdir = ''
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'skyclause-camera-'))
  outdir = join(root, 'dist')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('buildCamera', () => {
  const ingestUrl = 'https://script.google.com/macros/s/AKfycbx-Pilot_Deployment1/exec'

  test('writes the web app /exec URL into config.json and nothing secret', async () => {
    await buildCamera({ outdir, ingestUrl })
    expect(JSON.parse(readFileSync(join(outdir, 'config.json'), 'utf8'))).toEqual({ ingest_url: ingestUrl })
  })

  test('ships the static page: markup, one script and config', async () => {
    await buildCamera({ outdir, ingestUrl })
    expect(readdirSync(outdir).sort()).toEqual(['app.js', 'config.json', 'index.html'])
    const html = readFileSync(join(outdir, 'index.html'), 'utf8')
    expect(html).toContain('<h1>Skyline camera</h1>')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('<script src="./app.js" defer></script>')
    const js = readFileSync(join(outdir, 'app.js'), 'utf8')
    expect(js).toContain('camera_frame')
    expect(js).toContain('cam-1')
  })

  test('bakes neither the token nor the URL into the script', async () => {
    await buildCamera({ outdir, ingestUrl })
    const js = readFileSync(join(outdir, 'app.js'), 'utf8')
    expect(js).not.toContain('CAMERA_TOKEN')
    expect(js).not.toContain(ingestUrl)
  })

  test("refuses an unset URL or one that isn't a deployed /exec URL", async () => {
    for (const bad of [
      '',
      'https://script.google.com/macros/s/AKfycbx-Pilot_Deployment1/dev',
      'http://script.google.com/macros/s/AKfycbx-Pilot_Deployment1/exec',
      'https://example.com/macros/s/AKfycbx-Pilot_Deployment1/exec'
    ]) {
      await expect(buildCamera({ outdir, ingestUrl: bad })).rejects.toThrow('INGEST_URL')
    }
  })
})
