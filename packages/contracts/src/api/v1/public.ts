import { getPublicProjectStatus } from './public/getPublicProjectStatus'
import { listPublicProjectCalls } from './public/listPublicProjectCalls'
import { listPublicLedgerEntries } from './public/listPublicLedgerEntries'
import { listPublicGrades } from './public/listPublicGrades'
import { listPublicCalendarEntries } from './public/listPublicCalendarEntries'
import { getPublicCall } from './public/getPublicCall'
import { getPublicWindow } from './public/getPublicWindow'
import { getPublicServiceStatus } from './public/getPublicServiceStatus'
import { streamPublicProjectState } from './public/streamPublicProjectState'
import { evaluatePublicProject } from './public/evaluatePublicProject'

export { getPublicProjectStatus } from './public/getPublicProjectStatus'
export { listPublicProjectCalls } from './public/listPublicProjectCalls'
export { listPublicLedgerEntries } from './public/listPublicLedgerEntries'
export { listPublicGrades } from './public/listPublicGrades'
export { listPublicCalendarEntries } from './public/listPublicCalendarEntries'
export { getPublicCall } from './public/getPublicCall'
export { getPublicWindow } from './public/getPublicWindow'
export { getPublicServiceStatus } from './public/getPublicServiceStatus'
export { streamPublicProjectState } from './public/streamPublicProjectState'
export { evaluatePublicProject } from './public/evaluatePublicProject'

export const routes = [
  getPublicProjectStatus,
  listPublicProjectCalls,
  listPublicLedgerEntries,
  listPublicGrades,
  listPublicCalendarEntries,
  getPublicCall,
  getPublicWindow,
  getPublicServiceStatus,
  streamPublicProjectState,
  evaluatePublicProject
] as const
