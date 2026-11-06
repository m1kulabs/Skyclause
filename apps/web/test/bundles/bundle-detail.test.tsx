import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test, vi } from 'vitest'
import { BundleDetail } from '../../features/bundles/bundle-detail'

vi.mock('next/navigation', () => ({ useParams: () => ({ org: 'test-org', project: 'test-project' }) }))

test('bundle detail starts with a named loading state, without inventing calls', () => {
  const html = renderToStaticMarkup(<BundleDetail bundleId="test-bundle" />)
  expect(html).toContain('Loading bundle')
  expect(html).not.toContain('data-unbuilt="c-bundle-ui"')
  expect(html).not.toContain('Approve')
})
