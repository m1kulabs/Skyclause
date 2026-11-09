import { getClauseSheetPublishPreview } from './clause-sheets/getClauseSheetPublishPreview'
import { publishClauseSheet } from './clause-sheets/publishClauseSheet'

export { getClauseSheetPublishPreview } from './clause-sheets/getClauseSheetPublishPreview'
export { publishClauseSheet } from './clause-sheets/publishClauseSheet'

export const routes = [getClauseSheetPublishPreview, publishClauseSheet] as const
