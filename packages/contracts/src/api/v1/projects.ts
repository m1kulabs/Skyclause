import { listProjects } from './projects/listProjects'
import { getProject } from './projects/getProject'

export { listProjects } from './projects/listProjects'
export { getProject } from './projects/getProject'

export const routes = [listProjects, getProject] as const
