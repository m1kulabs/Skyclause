import { IdParams as ProjectParams, problemResponse } from '../../common'
import { z } from '@hono/zod-openapi'
import { PageQuery, Poll, Reading, Source, SourceRole, SourceState } from '../../shared'

export const ProjectSourceParams = ProjectParams.extend({ sourceId: ProjectParams.shape.id })

export const PageRequest = z.object({ ...PageQuery.shape })

export const ProjectSource = Source.extend({
  project_id: z.string(),
  role: SourceRole,
  state: SourceState,
  latest_reading: Reading.nullable(),
  age_s: z.number().int().nonnegative().nullable(),
  recent_errors: z.array(Poll)
})

export const DeviceCredential = z.object({
  source_id: z.string(),
  token: z.string(),
  scope: z.literal('ingest')
})

export const projectErrors = {
  400: problemResponse('The organization header is missing or invalid.'),
  401: problemResponse('Authentication is required.'),
  403: problemResponse('The principal lacks permission for this operation.'),
  404: problemResponse('The project or source is unavailable in this organization.'),
  422: problemResponse('The request is invalid.'),
  429: problemResponse('The request rate limit was exceeded.')
}
