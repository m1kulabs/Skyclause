import { expect, test } from 'vitest'
import { REGISTRY } from '../../src/api/registry'

type Operation = (typeof REGISTRY)[number]
type OperationId = Operation['operationId']
type RouteFor<Id extends OperationId> = Extract<Operation, { operationId: Id }>
const route = <Id extends OperationId>(operationId: Id): RouteFor<Id> =>
  REGISTRY.find((item) => item.operationId === operationId) as RouteFor<Id>

test('#107 audit filters and exports include target fields and CSV or JSON formats', () => {
  const list = route('listAuditEntries')
  const listFilters = list.request.query.parse({ target_type: 'membership', target_id: 'member-1' })
  expect(listFilters).toMatchObject({ target_type: 'membership', target_id: 'member-1' })

  const exportRoute = route('exportAuditLog')
  expect(exportRoute.request.query.safeParse({ target_id: 'member-1', format: 'json' }).success).toBe(true)
  expect(exportRoute.responses[200].content).toHaveProperty('application/json')
  expect(exportRoute.responses[200].content).toHaveProperty('text/csv')
})

test('#109 export and deletion operations use the current job and confirmation schemas', () => {
  const accountDeletion = route('deleteMyAccount')
  expect(
    accountDeletion.request.body.content['application/json'].schema.safeParse({ email: 'owner@example.test' }).success
  ).toBe(true)

  const download = route('downloadExport')
  expect(download.responses).toHaveProperty('302')
  expect(download.responses).toHaveProperty('410')

  const job = route('createOrganisationExport').responses[202].content['application/json'].schema.parse({
    id: '018f47a3-b2c1-7c00-8000-000000000701',
    scope: 'organisation',
    status: 'ready',
    formats: ['json', 'csv'],
    error: null,
    expires_at: '2026-11-18T00:00:00Z',
    created_at: '2026-11-10T00:00:00Z',
    download_url: null
  })
  expect(job).toMatchObject({ formats: ['json', 'csv'], error: null, download_url: null })
})
