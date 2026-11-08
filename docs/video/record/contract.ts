import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export type Box = { x: number; y: number; width: number; height: number }
export type Cue = { id: string; tMs: number; box: Box | null }
export type Observation = { id: string; expected: string; actual: string; matches: boolean }
export type Take = {
  shotId: string
  runId: string
  status: 'ok' | 'ok-deviation' | 'failed'
  method: 'screencast' | 'check'
  file: string | null
  durationMs: number
  fps: number
  viewport: { width: number; height: number }
  cues: Cue[]
  observations: Observation[]
  note?: string
}
export type Manifest = { runId: string; mode: 'record' | 'check'; browser: string; takes: Take[] }
export type Shot = {
  id: string
  needs: 'none' | 'dev-pilot' | 'ge'
  kind: 'motion' | 'recorded'
  target_s: number
  cues?: string[]
  surface?: string
  setup_off_camera?: string
  on_camera: string
  privacy?: string
}
type Shots = { viewport: { width: number; height: number; deviceScaleFactor: number }; fps: number; shots: Shot[] }

export const VIDEO_ROOT = resolve(import.meta.dirname, '..')
export const RUN_ID = process.env.SKYCLAUSE_RUN_ID
if (!RUN_ID) throw new Error('SKYCLAUSE_RUN_ID is unset; record/playwright.config.ts assigns a new run id')
export const CHECK = process.env.CHECK === '1'
export const SHOTS = JSON.parse(readFileSync(join(VIDEO_ROOT, 'shots.json'), 'utf8')) as Shots
export const RECORD_SHOTS = SHOTS.shots.filter((shot) => shot.kind === 'recorded')
export const STORAGE_STATE = join(VIDEO_ROOT, 'record/.state/google.json')

export function shot(id: string): Shot {
  const found = SHOTS.shots.find((item) => item.id === id)
  if (!found) throw new Error(`Shot ${id} is not in shots.json`)
  return found
}

export function runDir(): string {
  return CHECK ? join(VIDEO_ROOT, 'record/preflight', RUN_ID!) : join(VIDEO_ROOT, 'public/footage/runs', RUN_ID!)
}

export const manifestPath = () => join(runDir(), 'manifest.json')
export const hasStorageState = () => existsSync(STORAGE_STATE)
