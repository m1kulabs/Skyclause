import { z } from '@hono/zod-openapi'
import { SLUG_REGEX } from '../../../slugs'
import { Project, ProjectPack, RotaShift } from '../../shared'

export const RotaOverride = z.array(RotaShift.omit({ id: true, project_id: true })).nullable()

export const ProjectSettings = Project.extend({ rota_override: RotaOverride })

export const ProjectUpdate = Project.pick({
  name: true,
  time_zone: true,
  public: true,
  semester_ends_on: true,
  site_name: true,
  site_lat: true,
  site_lon: true,
  camera_day_start: true,
  camera_day_end: true,
  warning_area_terms: true
})
  .extend({
    slug: z.string().regex(SLUG_REGEX),
    packs: z
      .array(ProjectPack.pick({ pack: true, enabled: true, schedule: true, sla_s: true }))
      .describe('Currently refused with 422 validation-failed; pack settings are managed by the source-binding owner.'),
    rota_override: RotaOverride.describe(
      'Currently refused with 422 validation-failed; rota writes are not available here.'
    )
  })
  .partial()
