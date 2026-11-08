// #150 test helpers, for this package and for #151, #153 and the API tests: a project with a pack, a published sheet
// version carrying clause expiries, a snapshot and a run ready to hand calls to `createBundle`. Tests only (NFR-15).
import type { Json, Pack } from '@skyclause/contracts'
import type { CallDraft } from '../../src/bundles/repository'
import type { Tx } from '../../src/client'
import {
  makeClauseSheet,
  makeIndicatorSnapshot,
  makeProject,
  makeProjectPack,
  makeRun,
  makeSheetVersion,
  makeWindow
} from '../factories/index'

/** The default sheets' clause expiries (#79 §1 Defaults: `storm_confirmed` and `flash_flood_risk` end). */
export const DEFAULT_EXPIRIES: Record<string, 'start' | 'end'> = {
  haze_watch: 'start',
  haze_severe: 'start',
  storm_watch: 'start',
  storm_confirmed: 'end',
  flash_flood_risk: 'end'
}

export interface Scene {
  projectId: string
  pack: Pack
  sheetVersionId: string
  snapshotId: string
}

/** A project (or `projectId`) with `pack` at `slaS`, a published sheet version and a snapshot. */
export async function bundleScene(
  tx: Tx,
  o: {
    projectId?: string
    pack?: Pack
    slaS?: number | null
    expiries?: Record<string, 'start' | 'end'>
    snapshot?: { site?: Json; inputs?: Json; tEval?: Date; hash?: string }
  } = {}
): Promise<Scene> {
  const pack = o.pack ?? 'sky'
  const projectId = o.projectId ?? (await makeProject(tx)).id
  await makeProjectPack(tx, { projectId, pack, slaS: o.slaS === undefined ? 300 : o.slaS })
  const sheet = await makeClauseSheet(tx, { projectId, pack })
  const clauses = Object.entries(o.expiries ?? DEFAULT_EXPIRIES).map(([key, expiry]) => ({ key, expiry }))
  const version = await makeSheetVersion(tx, {
    sheetId: sheet.id,
    status: 'published',
    content: { pack, clauses },
    publishedAt: new Date()
  })
  const snapshot = await makeIndicatorSnapshot(tx, { projectId, pack, ...o.snapshot })
  return { projectId, pack, sheetVersionId: version.id, snapshotId: snapshot.id }
}

/** A drafted run of the scene, as #151 leaves it before `createBundle`. */
export async function runOf(tx: Tx, scene: Scene, triggeredAt = new Date()) {
  return makeRun(tx, {
    projectId: scene.projectId,
    pack: scene.pack,
    trigger: 'crossing',
    status: 'drafted',
    sheetVersionId: scene.sheetVersionId,
    snapshotId: scene.snapshotId,
    verdictHash: `verdict-${scene.snapshotId}`,
    triggeredAt
  })
}

/** A window of the scene's project. */
export function windowOf(tx: Tx, scene: Scene, startsAt: Date, endsAt: Date, title = 'Window') {
  return makeWindow(tx, { projectId: scene.projectId, startsAt, endsAt, title, kind: 'commute_wave' })
}

/** One call for `windowId`, Normal unless `o` says otherwise, agreeing with a shadow verdict of the same mode. */
export function callDraft(o: Partial<CallDraft> & ({ windowId: string } | { nightId: string })): CallDraft {
  const mode = o.mode === undefined ? 'normal' : o.mode
  const watch = o.watch ?? false
  const noCall = o.noCall ?? null
  return {
    mode,
    watch,
    noCall,
    fired: [],
    recommendations: [],
    recipients: [],
    notices: [],
    reason: '',
    shadow: {
      scope: o.windowId ? { kind: 'window', id: o.windowId } : { kind: 'night', id: o.nightId ?? null },
      pack: 'sky',
      mode,
      watch,
      no_call: noCall ? { inputs: [] } : null,
      recommendations: [],
      clauses: [],
      open_from: null
    },
    chosen: 'agent',
    agrees: true,
    ...o
  }
}
