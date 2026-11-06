import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import {
  Grade,
  Instant,
  LocalDate,
  Mode,
  Pack,
  Problem,
  ProjectRef,
  Source,
  SourceState,
  Verdict,
  Window
} from '../shared'

const problemResponse = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: Problem } }
})

const dashboardBlock = <Item extends z.ZodType>(item: Item) =>
  z.object({
    data: z.array(item),
    n: z.number().int().nonnegative(),
    next_action: z.string().nullable()
  })

const reviewBundleSchema = z.object({
  id: z.string(),
  project: ProjectRef,
  pack: Pack,
  sla_due_at: Instant,
  seconds_remaining: z.number().int()
})

const atRiskWindowSchema = z.object({
  project: ProjectRef,
  window: Window,
  verdict: Verdict
})

const signalHealthSchema = z.object({
  project: ProjectRef,
  source: Source,
  state: SourceState,
  age_s: z.number().int().nonnegative().nullable()
})

const upcomingRiskSchema = z.object({
  project: ProjectRef,
  pack: Pack,
  date: LocalDate,
  starts_at: Instant,
  mode: Mode.nullable()
})

const yesterdayGradeSchema = z.object({ project: ProjectRef, grade: Grade })

export const getDashboard = createRoute({
  method: 'get',
  path: '/v1/dashboard',
  operationId: 'getDashboard',
  tags: ['Dashboard'],
  request: {
    headers: z.object({ 'Skyclause-Organization': z.string().min(1) })
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

export const routes = [getDashboard] as const
