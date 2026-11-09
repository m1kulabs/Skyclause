import { updateProject } from './projects/updateProject'
import { archiveProject } from './projects/archiveProject'
import { restoreProject } from './projects/restoreProject'

export { updateProject } from './projects/updateProject'
export { archiveProject } from './projects/archiveProject'
export { restoreProject } from './projects/restoreProject'

export const routes = [updateProject, archiveProject, restoreProject] as const
