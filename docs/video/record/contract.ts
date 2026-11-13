import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

export type Box = { x: number; y: number; width: number; height: number }
export type Cue = { id: string; tMs: number; box: Box | null }
/** One sample of a tracked element: its box while it is visible, on top and opaque, else null. */
export type TrackSample = { tMs: number; box: Box | null }
export type MaskSample = { tMs: number; boxes: Box[] }
export type Observation = { id: string; expected: string; actual: string; matches: boolean }
export type Take = {
  beat: string
  runId: string
  status: 'ok' | 'ok-deviation' | 'failed'
  method: 'screencast' | 'check'
  file: string | null
  durationMs: number
  fps: number
  viewport: { width: number; height: number }
  /** When the sync mark showed, from the first frame by the clock; ingest measures the real frame and shifts. */
  syncMs: number | null
  /** The longest gap between two samples of tracks and masks (a navigation can stall one). */
  sampleGapMs: number
  /**
   * Every sampling tick as [start, end] ms. A tick's reading holds for some moment inside it, so a change first seen
   * at tick k happened after tick k−1 started and before tick k ended: masks and callouts use these exact bounds.
   */
  ticks: [number, number][]
  cues: Cue[]
  /** Every cue's element, sampled every ~100 ms; change points only. Callouts read these, never a fixed box. */
  tracks: Record<string, TrackSample[]>
  /** Boxes of every email address and account avatar on screen, sampled every ~100 ms; change points only. */
  masks: MaskSample[]
  writes: string[]
  observations: Observation[]
  note?: string
}
export type Manifest = { runId: string; mode: 'record' | 'check'; browser: string; takes: Take[] }

export const VIDEO_ROOT = resolve(import.meta.dirname, '..')
// PUBLIC_DIR moves footage out of public/ (a scratch smoke test); the default is the Remotion public folder.
export const PUBLIC_DIR = process.env.PUBLIC_DIR ?? join(VIDEO_ROOT, 'public')
export const RUN_ID = process.env.SKYCLAUSE_RUN_ID
if (!RUN_ID) throw new Error('SKYCLAUSE_RUN_ID is unset; record/playwright.config.ts assigns a new run id')
export const CHECK = process.env.CHECK === '1'
export const FPS = 30
/** How long the sync mark shows. 600 ms, so even a slow high-scale screencast captures it (300 ms was missed at 3×). */
export const SYNC_MS = 600
export const VIEWPORT = { width: 1920, height: 1080 }
// Saved by a person, by hand (brief section 12, item 1). Nothing here signs in.
export const STORAGE_STATE = join(VIDEO_ROOT, 'record/.state/app.json')
export const APP = 'https://app.skyclause.m1ku.tech'
export const PROJECT = '/skyclause-pilot/bukit-jalil'
export const SITE = 'https://skyclause.m1ku.tech'

export function runDir(): string {
  return CHECK ? join(VIDEO_ROOT, 'record/preflight', RUN_ID!) : join(PUBLIC_DIR, 'footage/runs', RUN_ID!)
}

export const manifestPath = () => join(runDir(), 'manifest.json')
export const hasStorageState = () => existsSync(STORAGE_STATE)
