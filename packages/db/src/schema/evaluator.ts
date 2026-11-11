import { integer, jsonb, pgTable, primaryKey, text, unique, uuid } from 'drizzle-orm/pg-core'
import { id, instant, sameOrg, tenantTable } from './columns'
import { inputState } from './enums'
import { pack, project } from './project'
import { source } from './sources'

/** Private S append-only transition and frozen recipients. Never exposed through tenant source-state reads. */
export const evaluatorSourceTransition = pgTable('evaluator_source_transition', {
  id: id(),
  sourceId: uuid('source_id')
    .notNull()
    .references(() => source.id, { onDelete: 'cascade' }),
  at: instant('at').notNull(),
  state: inputState('state').notNull(),
  since: instant('since').notNull(),
  httpStatus: integer('http_status'),
  pendingUntil: instant('pending_until'),
  eventType: text('event_type'),
  targets: jsonb('targets').notNull(),
  createdAt: instant('created_at').notNull().defaultNow()
})
/** Private S mutable delivery intents; retained until every recipient is acknowledged. */
export const evaluatorSourceDelivery = pgTable(
  'evaluator_source_delivery',
  {
    transitionId: uuid('transition_id')
      .notNull()
      .references(() => evaluatorSourceTransition.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    recipientOrgId: uuid('recipient_org_id').notNull(),
    completedAt: instant('completed_at')
  },
  (self) => [primaryKey({ columns: [self.transitionId, self.projectId] })]
)
/** Domain handlers can durably request another evaluation in their existing tenant transaction. */
export const evaluatorReevaluation = tenantTable(
  'evaluator_reevaluation',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    pack: pack('pack').notNull(),
    requestedAt: instant('requested_at').notNull(),
    completedAt: instant('completed_at'),
    reason: text('reason').notNull()
  },
  (self) => [
    sameOrg('evaluator_reevaluation_project', self, self.projectId, project, true),
    unique('evaluator_reevaluation_project_pack_key').on(self.projectId, self.pack)
  ]
)

/** Each generation retains its own cleanup state; a delayed delete can never erase its successor. */
export const evaluatorDeadline = tenantTable(
  'evaluator_deadline',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    generation: uuid('generation').notNull(),
    dueAt: instant('due_at').notNull(),
    createdAt: instant('created_at'),
    retiredAt: instant('retired_at'),
    cleanedAt: instant('cleaned_at')
  },
  (self) => [
    sameOrg('evaluator_deadline_project', self, self.projectId, project, true),
    unique('evaluator_deadline_generation_key').on(self.projectId, self.generation)
  ]
)
