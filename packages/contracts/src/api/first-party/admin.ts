import { listModerationReports } from './admin/listModerationReports'
import { decideModerationWindow } from './admin/decideModerationWindow'
import { createModerationBlock } from './admin/createModerationBlock'
import { listIncidents } from './admin/listIncidents'
import { createIncident } from './admin/createIncident'
import { updateIncident } from './admin/updateIncident'

export { listModerationReports } from './admin/listModerationReports'
export { decideModerationWindow } from './admin/decideModerationWindow'
export { createModerationBlock } from './admin/createModerationBlock'
export { listIncidents } from './admin/listIncidents'
export { createIncident } from './admin/createIncident'
export { updateIncident } from './admin/updateIncident'

export const routes = [
  listModerationReports,
  decideModerationWindow,
  createModerationBlock,
  listIncidents,
  createIncident,
  updateIncident
] as const
