import { expect, test } from 'vitest'
import { crawlRoutes } from '../../e2e/quality/routes'

// `.next/app-path-routes-manifest.json` from a Next 16.4.5 build with PLANTED_ROUTES=1, plus two later shapes.
const manifest = {
  '/(marketing)/quality-planted/vitals/page': '/quality-planted/vitals',
  '/_global-error/page': '/_global-error',
  '/_not-found/page': '/_not-found',
  '/health/route': '/health',
  '/(marketing)/page': '/',
  '/(public)/legal/privacy/page': '/legal/privacy',
  '/(public)/legal/__test/error/page': '/legal/__test/error',
  '/(public)/legal/__test/attribution/page': '/legal/__test/attribution',
  '/(public)/legal/terms/page': '/legal/terms',
  '/(public)/ms/legal/privacy/page': '/ms/legal/privacy',
  '/quality-planted/unlabelled-input/page': '/quality-planted/unlabelled-input',
  '/(public)/p/[org]/[project]/page': '/p/[org]/[project]',
  '/(app)/[org]/settings/(scope)/members/page': '/[org]/settings/members'
}

test('every built page is crawled with its route group, and route handlers are not', () => {
  expect(crawlRoutes(manifest)).toEqual([
    { path: '/', group: 'marketing', dynamic: false, status: 200 },
    { path: '/[org]/settings/members', group: 'app', dynamic: true, params: ['org'], status: 200 },
    { path: '/_not-found', group: 'public', dynamic: false, status: 404 },
    { path: '/legal/__test/attribution', group: 'public', dynamic: false, status: 200 },
    { path: '/legal/__test/error', group: 'public', dynamic: false, status: 200 },
    { path: '/legal/privacy', group: 'public', dynamic: false, status: 200 },
    { path: '/legal/terms', group: 'public', dynamic: false, status: 200 },
    { path: '/ms/legal/privacy', group: 'public', dynamic: false, status: 200 },
    { path: '/p/[org]/[project]', group: 'public', dynamic: true, status: 200 },
    { path: '/quality-planted/unlabelled-input', group: null, dynamic: false, status: 200 },
    { path: '/quality-planted/vitals', group: 'marketing', dynamic: false, status: 200 }
  ])
})

test('onboarding routes declare fixtures so the role crawl can visit them', () => {
  const routes = crawlRoutes({
    '/(app)/[org]/new/page': '/[org]/new',
    '/(app)/[org]/[project]/settings/packs/page': '/[org]/[project]/settings/packs'
  })

  expect(routes).toEqual([
    { path: '/[org]/[project]/settings/packs', group: 'app', dynamic: true, params: ['org', 'project'], status: 200 },
    { path: '/[org]/new', group: 'app', dynamic: true, params: ['org'], status: 200 }
  ])
})

test('a page whose only parameter is the organisation is crawled in each role’s own organisation', () => {
  const routes = crawlRoutes({
    '/(app)/[org]/page': '/[org]',
    '/(app)/[org]/projects/page': '/[org]/projects',
    '/(app)/[org]/settings/audit/page': '/[org]/settings/audit',
    '/(app)/[org]/[project]/ledger/page': '/[org]/[project]/ledger',
    '/(auth)/invite/[token]/page': '/invite/[token]'
  })

  expect(routes.map(({ path, params }) => ({ path, params }))).toEqual([
    { path: '/[org]', params: undefined },
    { path: '/[org]/[project]/ledger', params: ['org', 'project'] },
    { path: '/[org]/projects', params: ['org'] },
    { path: '/[org]/settings/audit', params: ['org'] },
    { path: '/invite/[token]', params: undefined }
  ])
})

test('a page under a project is crawled at a project in each role’s organisation, whatever else it takes', () => {
  const routes = crawlRoutes({
    '/(app)/[org]/[project]/page': '/[org]/[project]',
    '/(app)/[org]/[project]/settings/channels/page': '/[org]/[project]/settings/channels',
    '/(app)/[org]/[project]/bundles/[id]/page': '/[org]/[project]/bundles/[id]',
    '/(camera)/[org]/[project]/camera/[sourceId]/page': '/[org]/[project]/camera/[sourceId]'
  })

  expect(routes.map(({ path, group, params }) => ({ path, group, params }))).toEqual([
    { path: '/[org]/[project]', group: 'app', params: undefined },
    { path: '/[org]/[project]/bundles/[id]', group: 'app', params: ['org', 'project'] },
    { path: '/[org]/[project]/camera/[sourceId]', group: 'camera', params: ['org', 'project'] },
    { path: '/[org]/[project]/settings/channels', group: 'app', params: ['org', 'project'] }
  ])
})
