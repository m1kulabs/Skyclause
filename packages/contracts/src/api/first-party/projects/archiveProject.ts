import { IdParams, CommonProblems } from '../../common'
import { createRoute } from '../../create-route'
import { ProjectSettings } from './_shared'

export const archiveProject = createRoute({
  method: 'post',
  path: '/api/projects/{id}/archive',
  operationId: 'archiveProject',
  tags: ['projects'],
  request: { params: IdParams },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: ProjectSettings } } }
  },
  x: { owner: 'b-projects-api', statement: 'project.manage', idempotent: false }
})
