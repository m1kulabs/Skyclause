import { problemResponse } from '../../common'
import { createRoute } from '../../create-route'
import { Me } from './_shared'

export const getMe = createRoute({
  method: 'get',
  path: '/v1/me',
  operationId: 'getMe',
  tags: ['Identity'],
  responses: {
    200: { description: 'Current principal', content: { 'application/json': { schema: Me } } },
    401: problemResponse('Authentication is required.'),
    403: problemResponse('The principal cannot access this operation.')
  },
  x: { owner: 'e-cli-core', statement: 'any', idempotent: false }
})
