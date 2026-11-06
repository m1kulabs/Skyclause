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
  Problem,
  Window
} from '../shared'
import { ROLES } from '../../auth'

// D2: sessions select an organisation by slug or ID; scoped keys and grants already carry it.
const OrganizationHeaders = z.object({
  'Skyclause-Organization': z.string().min(1).optional().describe('Required for sessions; organisation slug or ID')
})
const IdParams = z.object({ id: z.string().min(1) })
const ProblemResponses = {
  400: {
    description: 'organization-required or validation-failed.',
    content: { 'application/problem+json': { schema: Problem } }
  },
  401: { description: 'Authentication required.', content: { 'application/problem+json': { schema: Problem } } },
  403: {
    description: 'insufficient-scope: permission denied.',
    content: { 'application/problem+json': { schema: Problem } }
  },
  404: {
    description: 'Resource not found, including a row in another organisation.',
    content: { 'application/problem+json': { schema: Problem } }
  },
  429: {
    description: 'rate-limited or budget-exhausted.',
    headers: z.object({ 'Retry-After': z.string().regex(/^\d+$/).describe('Retry delay in seconds') }),
    content: { 'application/problem+json': { schema: Problem } }
  }
}

// z.json() is recursive; explicit JSON Schema types prevent the OpenAPI converter from recursing forever.
// Keep the shared JSON validator, including nested objects and arrays, unchanged at runtime.
const JsonValue = LedgerEntry.shape.body.openapi({ type: ['string', 'number', 'boolean', 'object', 'array', 'null'] })

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
  verified_at: Instant
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
