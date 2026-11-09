import { IdParams, ProblemResponse, CommonProblems } from '../../common'
import { createRoute } from '../../create-route'
import { ProjectSettings, ProjectUpdate } from './_shared'

// Changing public also requires public_pages.edit (spec §4).
export const updateProject = createRoute({
  method: 'patch',
  path: '/api/projects/{id}',
  operationId: 'updateProject',
  tags: ['projects'],
  request: { params: IdParams, body: { required: true, content: { 'application/json': { schema: ProjectUpdate } } } },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: ProjectSettings } } },
    422: {
      ...ProblemResponse,
      description: 'validation-failed, including unsupported packs or rota_override writes; slug-reserved or slug-taken'
    },
    409: { ...ProblemResponse, description: 'slug-reserved, slug-taken or pack-prerequisites' }
  },
  x: { owner: 'b-projects-api', statement: 'project.manage', idempotent: false }
})
