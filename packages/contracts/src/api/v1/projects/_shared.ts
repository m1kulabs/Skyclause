import { problemResponse } from '../../common'
import { z } from '@hono/zod-openapi'
import { Bundle, InputState, LocalDate, Night, PackState, PageQuery, Project } from '../../shared'

export const ProjectSummary = z.object({
  pack_states: z.array(PackState),
  windows_at_risk: z.number().int(),
  signal_health: z.object({
    state: InputState,
    inputs_reporting: z.number().int(),
    oldest_age_s: z.number().int().nonnegative().nullable()
  }),
  latest_bundle: Bundle.nullable(),
  next_night: Night.nullable(),
  next_storm_date: LocalDate.nullable(),
  next_action: z.enum(['bind_source', 'declare_window']).nullable()
})

export const ProjectListItem = Project.extend({ summary: ProjectSummary.optional() })

export const ProjectListQuery = z.object({
  ...PageQuery.shape,
  slug: z.string().optional(),
  include: z.enum(['summary']).optional()
})

export const organizationErrors = {
  400: problemResponse('The organization header is missing or invalid.'),
  401: problemResponse('Authentication is required.'),
  403: problemResponse('The principal lacks project.view permission.'),
  404: problemResponse('The project is unavailable in this organization.'),
  422: problemResponse('The request parameters are invalid.'),
  429: problemResponse('The request rate limit was exceeded.')
}
