import shotContract from '../shots.json'
import takeManifests from '../record/manifests.json'
import voiceManifest from './data/voice-manifest.json'

export const FPS = 30
export const secondsToFrames = (seconds: number) => Math.round(seconds * FPS)
export const framesToSeconds = (frames: number) => frames / FPS

export type Need = 'none' | 'dev-pilot' | 'ge'
export type Shot = {
  id: string
  needs: Need
  kind: 'motion' | 'recorded'
  target_s: number
  cues?: string[]
  on_camera: string
}
export type TakeManifest = {
  shotId: string
  runId: string
  status: 'ok' | 'ok-deviation' | 'failed'
  method: 'screencast' | 'check'
  file: string | null
  durationMs: number
  fps: number
  viewport: { width: number; height: number }
  cues: { id: string; tMs: number; box: { x: number; y: number; width: number; height: number } | null }[]
  note?: string
}

export type Segment = {
  id: string
  title: string
  seconds: number
  needs: Need
  waitingFor?: string
}

const shots = (shotContract as { shots: Shot[] }).shots
export const shotList = shots
export const shotFor = (id: string) => shots.find((shot) => shot.id === id)

const needsFor = (id: string): Need => shotFor(id)?.needs ?? 'none'

const hazeText = shotFor('V3')?.on_camera ?? ''
const hazeMatch =
  /(\d+) Hybrid recommended, (\d+) Outdoor-limited, (\d+) Normal, (\d+) no data \((\d+) weekdays, ([^,)]+(?: to [^,)]+)?)/.exec(
    hazeText
  )
if (!hazeMatch) throw new Error('V3 tally values or replay period are missing from shots.json')
export const hazeTally = {
  categories: [
    { label: 'Hybrid recommended', glyph: '■', count: Number(hazeMatch[1]) },
    { label: 'Outdoor-limited', glyph: '◐', count: Number(hazeMatch[2]) },
    { label: 'Normal', glyph: '○', count: Number(hazeMatch[3]) },
    { label: 'No data', glyph: '⊘', count: Number(hazeMatch[4]) }
  ],
  weekdays: Number(hazeMatch[5]),
  period: hazeMatch[6]
}
if (hazeTally.categories.reduce((sum, category) => sum + category.count, 0) !== hazeTally.weekdays)
  throw new Error('V3 tally counts do not add up to the weekday total in shots.json')

export const segments: Segment[] = [
  { id: 'V1', title: 'Slate and one line', seconds: 15, needs: 'none' },
  { id: 'V2', title: 'The problem', seconds: 25, needs: 'none' },
  { id: 'D1', title: 'The window', seconds: 12, needs: needsFor('D1') },
  { id: 'D2', title: 'The signals', seconds: 15, needs: needsFor('D2') },
  { id: 'D3', title: 'The crossing', seconds: 30, needs: 'none' },
  { id: 'D4', title: 'The call', seconds: 20, needs: needsFor('D4') },
  { id: 'D5', title: 'The record', seconds: 10, needs: needsFor('D5') },
  { id: 'D6', title: 'Evidence on request', seconds: 13, needs: needsFor('D6') },
  { id: 'V3', title: 'Impact', seconds: 25, needs: 'none' },
  { id: 'V4', title: 'The research', seconds: 25, needs: 'none', waitingFor: 'confirmed research findings' },
  { id: 'V5', title: 'How we worked', seconds: 20, needs: 'none', waitingFor: 'confirmed team lanes' },
  { id: 'V6', title: 'Close', seconds: 15, needs: 'none' }
]

export const VIDEO_FRAMES = secondsToFrames(segments.reduce((total, segment) => total + segment.seconds, 0))

export function readTakeManifests(): TakeManifest[] {
  return takeManifests as TakeManifest[]
}

export function takeFor(shotId: string): TakeManifest | undefined {
  return readTakeManifests()
    .filter((take) => take.shotId === shotId && take.status !== 'failed' && take.file)
    .at(-1)
}

export function missingTitleCards(): string[] {
  return segments
    .filter((segment) => ['D1', 'D2', 'D4', 'D5', 'D6', 'V4', 'V5'].includes(segment.id) && !takeFor(segment.id))
    .map((segment) => segment.id)
}

export type VoiceAsset = { audio: string; words: string }
export function readVoiceAssets(): Record<string, VoiceAsset> {
  return (voiceManifest as { segments: Record<string, VoiceAsset> }).segments
}
