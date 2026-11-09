import { problemResponse, OrganizationHeaders } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import {
  atRiskWindowSchema,
  dashboardBlock,
  reviewBundleSchema,
  signalHealthSchema,
  upcomingRiskSchema,
  yesterdayGradeSchema
} from './_shared'

export const getDashboard = createRoute({
  method: 'get',
  path: '/v1/dashboard',
  operationId: 'getDashboard',
  tags: ['Dashboard'],
  request: {
    headers: OrganizationHeaders
  },
  responses: {
    200: {
      description: 'Organisation dashboard data.',
      content: {
        'application/json': {
          schema: z.object({
            needs_review: dashboardBlock(reviewBundleSchema),
            windows_at_risk: dashboardBlock(atRiskWindowSchema),
            signal_health: dashboardBlock(signalHealthSchema),
            upcoming_risks: dashboardBlock(upcomingRiskSchema),
            yesterday_grades: dashboardBlock(yesterdayGradeSchema)
          })
        }
      }
    },
    400: problemResponse('The organisation header is missing.'),
    401: problemResponse('Authentication is required.'),
    403: problemResponse('The caller lacks project view permission.'),
    404: problemResponse('The organisation or a requested resource was not found.')
  },
  x: { owner: 'd-org-api', statement: 'project.view', idempotent: false }
})
