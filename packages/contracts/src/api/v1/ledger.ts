import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses,
  JsonValue
} from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import {
  CallState,
  CallView,
  Grade,
  Instant,
  LedgerEntry,
  LedgerKind,
  LocalDate,
  Mode,
  Pack,
  Page,
  PageQuery,
  Window
} from '../shared'
import { ROLES } from '../../auth'

// LED-7: both the list and CSV export accept the screen's URL filters.
const LedgerFilters = z.object({
  from: LocalDate.optional(),
  to: LocalDate.optional(),
  pack: Pack.optional(),
  mode: Mode.optional(),
  state: CallState.optional(),
  kind: LedgerKind.optional()
})
const LedgerRow = LedgerEntry.extend({
  body: JsonValue,
  pack: Pack.nullable(),
  call: CallView.nullable(),
  window: Window.nullable(),
  grade: Grade.nullable(),
  approver_role: z.enum(ROLES).nullable()
})
const LedgerPage = Page(LedgerRow).extend({ total: z.number().int().nonnegative() })
const LedgerVerification = z.object({
  valid: z.boolean(),
  checked_entries: z.number().int().nonnegative(),
  first_bad_entry_id: z.string().nullable(),
  head_hash: z.string(),
  verified_at: Instant,
  // #146: the first bad entry's `seq` and why it broke the chain.
  first_bad: z
    .object({ id: z.string(), seq: z.number().int(), reason: z.enum(['seq_gap', 'prev_hash', 'hash']) })
    .optional()
})

export const listLedgerEntries = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/ledger',
  operationId: 'listLedgerEntries',
  tags: ['ledger'],
  request: { headers: OrganizationHeaders, params: IdParams, query: PageQuery.extend(LedgerFilters.shape) },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: LedgerPage } } }
  },
  x: { owner: 'c-ledger-chain', statement: 'ledger.view', idempotent: false }
})

export const exportLedger = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/ledger/export',
  operationId: 'exportLedger',
  tags: ['ledger'],
  request: { headers: OrganizationHeaders, params: IdParams, query: LedgerFilters },
  responses: {
    ...ProblemResponses,
    200: {
      description: 'CSV export of the filtered ledger, with window, mode, approver role, delay and grade.',
      content: { 'text/csv': { schema: z.string() } }
    }
  },
  x: { owner: 'c-ledger-chain', statement: 'ledger.view', idempotent: false }
})

export const verifyLedger = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/ledger/verify',
  operationId: 'verifyLedger',
  tags: ['ledger'],
  request: { headers: OrganizationHeaders, params: IdParams },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: LedgerVerification } } }
  },
  x: { owner: 'c-ledger-chain', statement: 'ledger.view', idempotent: false }
})

export const routes = [listLedgerEntries, exportLedger, verifyLedger] as const
