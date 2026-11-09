import { CommonProblems } from '../../common'
import { createRoute } from '../../create-route'
import { Page, PageQuery, Verification } from '../../shared'
import { ConnectTarget } from './_shared'

export const listConnectVerifications = createRoute({
  method: 'get',
  path: '/api/connect/verifications',
  operationId: 'listConnectVerifications',
  tags: ['connect'],
  request: { query: PageQuery.extend({ target: ConnectTarget.optional() }) },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: Page(Verification) } } }
  },
  x: { owner: 'e-connect-api', statement: 'session', idempotent: false }
})
