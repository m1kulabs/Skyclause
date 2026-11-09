import { listMyMemberships } from '@skyclause/contracts/api/first-party/me/listMyMemberships'
import { evaluateWhatIf as evaluate } from '@skyclause/contracts/api/v1/analysis/evaluateWhatIf'
import { getProjectAnalysis } from '@skyclause/contracts/api/v1/analysis/getProjectAnalysis'
import { getOrganisationAnalysis } from '@skyclause/contracts/api/v1/analysis/getOrganisationAnalysis'
import { listClauseSheets } from '@skyclause/contracts/api/v1/clause-sheets/listClauseSheets'
import { listClauseSheetVersions } from '@skyclause/contracts/api/v1/clause-sheets/listClauseSheetVersions'
import { listClauseSheetDrafts } from '@skyclause/contracts/api/v1/clause-sheets/listClauseSheetDrafts'
import { listGrades } from '@skyclause/contracts/api/v1/grades/listGrades'
import { listProjectListings } from '@skyclause/contracts/api/v1/listings/listProjectListings'
import { listNights } from '@skyclause/contracts/api/v1/nights/listNights'
import { listProjects } from '@skyclause/contracts/api/v1/projects/listProjects'
import { updateReviewItem as update } from '@skyclause/contracts/api/v1/review-items/updateReviewItem'
import { listReviewItems } from '@skyclause/contracts/api/v1/review-items/listReviewItems'
import { createApiFetch } from '../../lib/api-fetch'

function operation<
  const Route extends {
    method: string
    path: string
    request: object
    responses: { 200: { content: { 'application/json': { schema: { parse(value: unknown): unknown } } } } }
  }
>(
  route: Route
): {
  method: string
  path: Route['path']
  request: Route['request']
  response: Route['responses'][200]['content']['application/json']['schema']
} {
  return {
    method: route.method.toUpperCase(),
    path: route.path,
    request: route.request,
    response: route.responses[200].content['application/json'].schema
  }
}

export const analysisOperations = {
  getProjectAnalysis: operation(getProjectAnalysis),
  getOrganisationAnalysis: operation(getOrganisationAnalysis),
  listProjects: operation(listProjects),
  listMyMemberships: operation(listMyMemberships),
  listGrades: operation(listGrades),
  listReviewItems: operation(listReviewItems),
  listClauseSheets: operation(listClauseSheets),
  listClauseSheetVersions: operation(listClauseSheetVersions),
  listClauseSheetDrafts: operation(listClauseSheetDrafts),
  listNights: operation(listNights),
  listProjectListings: operation(listProjectListings),
  evaluateWhatIf: {
    ...operation(evaluate),
    request: { params: evaluate.request.params, body: evaluate.request.body.content['application/json'].schema }
  },
  updateReviewItem: {
    ...operation(update),
    request: { params: update.request.params, body: update.request.body.content['application/json'].schema }
  }
}

export const apiFetch = createApiFetch(analysisOperations)
export type Analysis = ReturnType<typeof analysisOperations.getProjectAnalysis.response.parse>
export type Metric = Analysis['metrics'][number]
export type Replay = ReturnType<typeof analysisOperations.evaluateWhatIf.response.parse>
export type Review = ReturnType<typeof analysisOperations.updateReviewItem.response.parse>
export type Graded = ReturnType<typeof analysisOperations.listGrades.response.parse>['data'][number]
export type Project = ReturnType<typeof analysisOperations.listProjects.response.parse>['data'][number]

export async function allPages<Item>(
  read: (cursor?: string) => Promise<{ data: Item[]; next_cursor: string | null }>
): Promise<Item[]> {
  const items: Item[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await read(cursor)
    items.push(...page.data)
    cursor = page.next_cursor ?? undefined
    if (cursor && seen.has(cursor)) throw new Error('Repeated analysis cursor')
    if (cursor) seen.add(cursor)
  } while (cursor)
  return items
}
