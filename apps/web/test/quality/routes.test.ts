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
    { path: '/[org]/settings/members', group: 'app', dynamic: true, status: 200 },
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
