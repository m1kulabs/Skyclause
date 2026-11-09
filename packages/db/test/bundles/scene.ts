// #150 test helpers, for this package and for #151, #153 and the API tests: a project with a pack, its default sheet
// published as version 1 (D18), a snapshot and a run ready to hand calls to `createBundle`. Tests only (NFR-15).
import { readFileSync } from 'node:fs'
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
import { asLogin } from '../harness/index'

/** `packages/clauses/defaults/<pack>.json`, the sheet every project starts with (#79 §1 Defaults, D18). */
export const defaultSheet = (pack: Pack): Json =>
  JSON.parse(readFileSync(new URL(`../../../clauses/defaults/${pack}.json`, import.meta.url), 'utf8'))

export interface Scene {
  projectId: string
  pack: Pack
  sheetVersionId: string
  snapshotId: string
}

/** A project (or `projectId`) with `pack` at `slaS`, its default sheet published as version 1 and a snapshot. */
export async function bundleScene(
  tx: Tx,
  o: {
    projectId?: string
    pack?: Pack
    slaS?: number | null
    snapshot?: { site?: Json; inputs?: Json; tEval?: Date; hash?: string }
  } = {}
): Promise<Scene> {
  const pack = o.pack ?? 'sky'
  const projectId = o.projectId ?? (await makeProject(tx)).id
  await makeProjectPack(tx, { projectId, pack, slaS: o.slaS === undefined ? 300 : o.slaS })
  const sheet = await makeClauseSheet(tx, { projectId, pack })
  const version = await makeSheetVersion(tx, {
    sheetId: sheet.id,
    status: 'published',
    content: defaultSheet(pack),
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

/** The project's ledger entries in `seq` order, read as the superuser so RLS hides nothing. */
export function ledgerOf(projectId: string) {
  return asLogin('postgres', async (client) => {
    const { rows } = await client.query<{ kind: string; refs: Record<string, string>; body: unknown }>(
      'SELECT kind, refs, body FROM ledger_entry WHERE project_id = $1 ORDER BY seq',
      [projectId]
    )
    return rows
  })
}
