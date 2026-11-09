import { IdParams, CommonProblems } from '../../common'
import { createRoute } from '../../create-route'
import { ProjectSettings } from './_shared'

export const restoreProject = createRoute({
  method: 'post',
  path: '/api/projects/{id}/restore',
  operationId: 'restoreProject',
  tags: ['projects'],
  request: { params: IdParams },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: ProjectSettings } } }
  },
  x: { owner: 'b-projects-api', statement: 'project.manage', idempotent: false }
})
