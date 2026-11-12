import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { ReviewTrace } from '../../features/bundles/review-trace'
import type { RunDetail } from '../../features/bundles/operations'

// An HTTP test double of getRun, never application data.
const run = {
  id: '019a45b0-0000-7000-8000-000000000002',
  project_id: 'test-project',
  pack: 'sky',
  trigger: 'crossing',
  dedupe_key: 'test-run',
  sheet_version_id: 'test-sheet',
  snapshot_id: 'test-snapshot',
  model: null,
  fallback_used: false,
  status: 'drafted',
  reason: null,
  trigger_ref: 'replay-20261102-1500',
  window_ids: [],
  verdict_hash: 'test-verdict'
} as unknown as RunDetail

test('the run line shows a short run ID and keeps the full one in its title', () => {
  const html = renderToStaticMarkup(<ReviewTrace calls={[]} run={run} normal={false} />)
  const line = /<p[^>]*>Run [^<]*<\/p>/.exec(html)?.[0] ?? ''
  expect(line).toContain('Run …00000002 · drafted')
  expect(line).toContain(`title="${run.id}"`)
  expect(html.replace(`title="${run.id}"`, '')).not.toContain(run.id)
})
