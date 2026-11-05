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
  test('writes the web app /exec URL into config.json and nothing secret', () => {
    const ingestUrl = 'https://script.google.com/macros/s/AKfycbx-Pilot_Deployment1/exec'
    buildCamera({ outdir, ingestUrl })
    expect(readdirSync(outdir)).toEqual(['config.json'])
    expect(JSON.parse(readFileSync(join(outdir, 'config.json'), 'utf8'))).toEqual({ ingest_url: ingestUrl })
  })

  test("refuses an unset URL or one that isn't a deployed /exec URL", () => {
    for (const ingestUrl of [
      '',
      'https://script.google.com/macros/s/AKfycbx-Pilot_Deployment1/dev',
      'http://script.google.com/macros/s/AKfycbx-Pilot_Deployment1/exec',
      'https://example.com/macros/s/AKfycbx-Pilot_Deployment1/exec'
    ]) {
      expect(() => buildCamera({ outdir, ingestUrl })).toThrow('INGEST_URL')
    }
  })
})
