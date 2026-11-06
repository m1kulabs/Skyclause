import { REGISTRY } from '@skyclause/contracts'
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

const evaluate = REGISTRY.find((route) => route.operationId === 'evaluateWhatIf')!
const update = REGISTRY.find((route) => route.operationId === 'updateReviewItem')!

export const analysisOperations = {
  getProjectAnalysis: operation(REGISTRY.find((route) => route.operationId === 'getProjectAnalysis')!),
  getOrganisationAnalysis: operation(REGISTRY.find((route) => route.operationId === 'getOrganisationAnalysis')!),
  listProjects: operation(REGISTRY.find((route) => route.operationId === 'listProjects')!),
  listMyMemberships: operation(REGISTRY.find((route) => route.operationId === 'listMyMemberships')!),
  listGrades: operation(REGISTRY.find((route) => route.operationId === 'listGrades')!),
  listReviewItems: operation(REGISTRY.find((route) => route.operationId === 'listReviewItems')!),
  listClauseSheets: operation(REGISTRY.find((route) => route.operationId === 'listClauseSheets')!),
  listClauseSheetVersions: operation(REGISTRY.find((route) => route.operationId === 'listClauseSheetVersions')!),
  listClauseSheetDrafts: operation(REGISTRY.find((route) => route.operationId === 'listClauseSheetDrafts')!),
  listNights: operation(REGISTRY.find((route) => route.operationId === 'listNights')!),
  listProjectListings: operation(REGISTRY.find((route) => route.operationId === 'listProjectListings')!),
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
