import { boolean, pgView, timestamp, uuid } from 'drizzle-orm/pg-core'

/** #142 activation projection; grants in migration b-create-project-ui-activation limit reads to `system`. */
export const onboardingActivation = pgView('onboarding_activation', {
  orgId: uuid('org_id').notNull(),
  firstProjectId: uuid('first_project_id'),
  orgCreatedAt: timestamp('org_created_at', { withTimezone: true }),
  projectCreatedAt: timestamp('project_created_at', { withTimezone: true }),
  sourceBoundAt: timestamp('source_bound_at', { withTimezone: true }),
  windowDeclaredAt: timestamp('window_declared_at', { withTimezone: true }),
  rotaSetAt: timestamp('rota_set_at', { withTimezone: true }),
  channelConnectedAt: timestamp('channel_connected_at', { withTimezone: true }),
  callGradedAt: timestamp('call_graded_at', { withTimezone: true }),
  activated: boolean('activated').notNull()
}).existing()
