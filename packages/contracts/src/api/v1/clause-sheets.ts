import { listClauseSheets } from './clause-sheets/listClauseSheets'
import { listClauseSheetVersions } from './clause-sheets/listClauseSheetVersions'
import { getClauseSheetVersion } from './clause-sheets/getClauseSheetVersion'
import { getClauseSheetDiff } from './clause-sheets/getClauseSheetDiff'
import { evaluateClauseSheet } from './clause-sheets/evaluateClauseSheet'
import { listClauseSheetDrafts } from './clause-sheets/listClauseSheetDrafts'
import { createClauseSheetDraft } from './clause-sheets/createClauseSheetDraft'
import { getClauseSheetDraft } from './clause-sheets/getClauseSheetDraft'
import { deleteClauseSheetDraft } from './clause-sheets/deleteClauseSheetDraft'
import { createReplay } from './clause-sheets/createReplay'

export { listClauseSheets } from './clause-sheets/listClauseSheets'
export { listClauseSheetVersions } from './clause-sheets/listClauseSheetVersions'
export { getClauseSheetVersion } from './clause-sheets/getClauseSheetVersion'
export { getClauseSheetDiff } from './clause-sheets/getClauseSheetDiff'
export { evaluateClauseSheet } from './clause-sheets/evaluateClauseSheet'
export { listClauseSheetDrafts } from './clause-sheets/listClauseSheetDrafts'
export { createClauseSheetDraft } from './clause-sheets/createClauseSheetDraft'
export { getClauseSheetDraft } from './clause-sheets/getClauseSheetDraft'
export { deleteClauseSheetDraft } from './clause-sheets/deleteClauseSheetDraft'
export { createReplay } from './clause-sheets/createReplay'

export const routes = [
  listClauseSheets,
  listClauseSheetVersions,
  getClauseSheetVersion,
  getClauseSheetDiff,
  evaluateClauseSheet,
  listClauseSheetDrafts,
  createClauseSheetDraft,
  getClauseSheetDraft,
  deleteClauseSheetDraft,
  createReplay
] as const
