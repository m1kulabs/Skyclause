import {
  UuidIdParams as IdParams,
  OrganizationHeaders as OrganizationHeader,
  IdempotentOrganizationHeaders as IdempotentHeaders,
  problemResponse,
  CommonErrors as commonErrors,
  UuidIdParams
} from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Page, PageQuery, ClauseSheet, SheetVersion, Verdicts } from '../shared'
import { Clause, SheetInput } from '../../clauses'

const VersionParams = IdParams.extend({ n: z.coerce.number().int().positive() })
const DraftParams = IdParams.extend({ draftId: IdParams.shape.id })

const CheckIssue = z.object({
  clause_key: z.string().nullable(),
  message: z.string(),
  offset: z.number().int().nonnegative(),
  length: z.number().int().nonnegative()
})
const CheckResult = z.object({ ok: z.boolean(), publishable: z.boolean(), issues: z.array(CheckIssue) })
const SheetContentBody = z.object({ content: SheetInput })
const SheetDiffEntry = z.object({ key: z.string(), before: Clause.nullable(), after: Clause.nullable() })
const ReplayResult = z.object({
  id: z.uuidv7(),
  label: z.literal('replay'),
  steps: z.array(z.object({ t_eval: z.iso.datetime(), verdicts: Verdicts })),
  summary: z.record(z.string(), z.number())
})
const ReplayRequest = z.object({
  version_id: z.uuidv7(),
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  step: z.string().regex(/^(reading|PT\d+M)$/),
  dataset_id: z.string().optional()
})

export const listClauseSheets = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/clause-sheets',
  operationId: 'listClauseSheets',
  tags: ['clause-sheets'],
  request: { params: IdParams, headers: OrganizationHeader, query: PageQuery },
  responses: {
    200: {
      description: 'Clause sheets enabled for the project',
      content: { 'application/json': { schema: Page(ClauseSheet) } }
    },
    ...commonErrors
  },
  x: { owner: 'b-clause-sheets-api', statement: 'project.view', idempotent: false }
})

export const listClauseSheetVersions = createRoute({
  method: 'get',
  path: '/v1/clause-sheets/{id}/versions',
  operationId: 'listClauseSheetVersions',
  tags: ['clause-sheets'],
  request: { params: IdParams, headers: OrganizationHeader, query: PageQuery },
  responses: {
    200: {
      description: 'Immutable clause sheet versions',
      content: { 'application/json': { schema: Page(SheetVersion) } }
    },
    ...commonErrors
  },
  x: { owner: 'b-clause-sheets-api', statement: 'project.view', idempotent: false }
})

export const getClauseSheetVersion = createRoute({
  method: 'get',
  path: '/v1/clause-sheets/{id}/versions/{n}',
  operationId: 'getClauseSheetVersion',
  tags: ['clause-sheets'],
  request: { params: VersionParams, headers: OrganizationHeader },
  responses: {
    200: { description: 'A numbered clause sheet version', content: { 'application/json': { schema: SheetVersion } } },
    ...commonErrors
  },
  x: { owner: 'b-clause-sheets-api', statement: 'project.view', idempotent: false }
})

export const getClauseSheetDiff = createRoute({
  method: 'get',
  path: '/v1/clause-sheets/{id}/diff',
  operationId: 'getClauseSheetDiff',
  tags: ['clause-sheets'],
  request: { params: IdParams, headers: OrganizationHeader },
  responses: {
    200: {
      description: 'Clause changes against the live version',
      content: { 'application/json': { schema: z.array(SheetDiffEntry) } }
    },
    ...commonErrors
  },
  x: { owner: 'b-clause-sheets-api', statement: 'project.view', idempotent: false }
})

export const evaluateClauseSheet = createRoute({
  method: 'post',
  path: '/v1/clause-sheets/{id}/evaluate',
  operationId: 'evaluateClauseSheet',
  tags: ['clause-sheets'],
  request: {
    params: IdParams,
    headers: OrganizationHeader,
    body: { content: { 'application/json': { schema: SheetContentBody } } }
  },
  responses: {
    200: {
      description: 'Type-check and evaluate a clause sheet against current indicators',
      content: { 'application/json': { schema: z.object({ check: CheckResult, verdicts: Verdicts }) } }
    },
    ...commonErrors,
    422: problemResponse('The clause sheet cannot be evaluated')
  },
  x: { owner: 'b-clause-sheets-api', statement: 'project.view', idempotent: false }
})

export const listClauseSheetDrafts = createRoute({
  method: 'get',
  path: '/v1/clause-sheets/{id}/drafts',
  operationId: 'listClauseSheetDrafts',
  tags: ['clause-sheets'],
  request: { params: IdParams, headers: OrganizationHeader, query: PageQuery },
  responses: {
    200: {
      description: 'Saved draft versions of a clause sheet',
      content: { 'application/json': { schema: Page(SheetVersion) } }
    },
    ...commonErrors
  },
  x: { owner: 'b-clause-sheets-api', statement: 'clause_draft.edit', idempotent: false }
})

export const createClauseSheetDraft = createRoute({
  method: 'post',
  path: '/v1/clause-sheets/{id}/drafts',
  operationId: 'createClauseSheetDraft',
  tags: ['clause-sheets'],
  request: {
    params: IdParams,
    headers: IdempotentHeaders,
    body: { content: { 'application/json': { schema: SheetContentBody } } }
  },
  responses: {
    201: { description: 'A saved clause sheet draft', content: { 'application/json': { schema: SheetVersion } } },
    ...commonErrors,
    409: problemResponse('A conflicting draft prevents this save'),
    422: problemResponse('The clause sheet is invalid')
  },
  x: { owner: 'b-clause-sheets-api', statement: 'clause_draft.edit', idempotent: true }
})

export const getClauseSheetDraft = createRoute({
  method: 'get',
  path: '/v1/clause-sheets/{id}/drafts/{draftId}',
  operationId: 'getClauseSheetDraft',
  tags: ['clause-sheets'],
  request: { params: DraftParams, headers: OrganizationHeader },
  responses: {
    200: { description: 'A saved clause sheet draft', content: { 'application/json': { schema: SheetVersion } } },
    ...commonErrors
  },
  x: { owner: 'b-clause-sheets-api', statement: 'clause_draft.edit', idempotent: false }
})

export const deleteClauseSheetDraft = createRoute({
  method: 'delete',
  path: '/v1/clause-sheets/{id}/drafts/{draftId}',
  operationId: 'deleteClauseSheetDraft',
  tags: ['clause-sheets'],
  request: { params: DraftParams, headers: OrganizationHeader },
  responses: {
    200: {
      description: 'The deleted draft identifier',
      content: { 'application/json': { schema: UuidIdParams } }
    },
    ...commonErrors
  },
  x: { owner: 'b-clause-sheets-api', statement: 'clause_draft.edit', idempotent: false }
})

export const createReplay = createRoute({
  method: 'post',
  path: '/v1/clause-sheets/{id}/replay',
  operationId: 'createReplay',
  tags: ['clause-sheets'],
  request: {
    params: IdParams,
    headers: IdempotentHeaders,
    body: { content: { 'application/json': { schema: ReplayRequest } } }
  },
  responses: {
    201: { description: 'A labelled replay result', content: { 'application/json': { schema: ReplayResult } } },
    ...commonErrors,
    422: problemResponse('The replay range or sheet version is invalid')
  },
  x: { owner: 'b-replay', statement: 'project.view', idempotent: true }
})

export const routes = [
  listClauseSheets,
  listClauseSheetVersions,
  getClauseSheetVersion,
  getClauseSheetDiff,
  evaluateClauseSheet,
  listClauseSheetDrafts,
  createClauseSheetDraft,
  getClauseSheetDraft,
  deleteClauseSheetDraft,
  createReplay
] as const
