import { describe, expect, test } from 'vitest'
import { SheetVersion } from '../../src/api/shared'
import { createClauseSheetDraft, evaluateClauseSheet, getClauseSheetDiff, routes } from '../../src/api/v1/clause-sheets'
import { getClauseSheetPublishPreview, publishClauseSheet } from '../../src/api/first-party/clause-sheets'

const id = '01950000-0000-7000-8000-000000000001'
const content = { pack: 'sky', clauses: [] }
const draft = {
  id,
  status: 'draft',
  n: null,
  content,
  content_hash: 'raw-hash',
  published_by: null,
  base_n: 1,
  published_at: null,
  check: null,
  publishable: false,
  validation_status: 'unavailable'
}
const body = evaluateClauseSheet.request.body.content['application/json'].schema

describe('clause sheet contracts (#135)', () => {
  test('draft and published numbers reflect publication status', () => {
    expect(SheetVersion.safeParse(draft).success).toBe(true)
    expect(SheetVersion.safeParse({ ...draft, n: 1 }).success).toBe(false)
    expect(
      SheetVersion.safeParse({
        ...draft,
        status: 'published',
        n: 1,
        base_n: null,
        published_at: '2026-11-10T00:00:00Z'
      }).success
    ).toBe(true)
    for (const n of [null, 0, -1])
      expect(SheetVersion.safeParse({ ...draft, status: 'published', n }).success).toBe(false)
    expect(SheetVersion.safeParse({ ...draft, published_at: 'yesterday' }).success).toBe(false)
  })

  test('draft saves retain optional base_n and snake_case check issue offsets', () => {
    const save = createClauseSheetDraft.request.body.content['application/json'].schema
    expect(save.parse({ content, base_n: 1 })).toHaveProperty('base_n', 1)
    expect(save.safeParse({ content }).success).toBe(true)
    expect(save.safeParse({ content, base_n: -1 }).success).toBe(false)
    const checked = {
      ...draft,
      validation_status: 'checked',
      check: {
        ok: false,
        publishable: false,
        issues: [{ clause_key: 'haze_severe', message: 'bad CEL', offset: 2, length: 4 }]
      }
    }
    expect(SheetVersion.parse(checked)).toMatchObject({
      check: { issues: [{ clause_key: 'haze_severe', offset: 2, length: 4 }] }
    })
    expect(
      SheetVersion.safeParse({
        ...checked,
        check: { ...checked.check, issues: [{ clause_key: null, message: 'bad', offset: -1, length: 0 }] }
      }).success
    ).toBe(false)
  })

  test('wire_contract_supports_diff_selection_and_labelled_evaluate', () => {
    const query = getClauseSheetDiff.request.query!
    expect(query.parse({ base: 'live', head: `draft:${id}` })).toEqual({ base: 'live', head: `draft:${id}` })
    expect(query.parse({ base: '1', head: '2' })).toEqual({ base: 1, head: 2 })
    expect(query.safeParse({ base: 'live', head: 'draft:bad' }).success).toBe(false)
    for (const selection of [{ content }, { draft_id: id }, { version_n: 1, at: '2026-11-10T00:00:00Z' }]) {
      expect(body.safeParse(selection).success).toBe(true)
    }
    for (const selection of [
      {},
      { content, draft_id: id },
      { draft_id: id, version_n: 1 },
      { content, version_n: 1 },
      { version_n: 0 },
      { draft_id: 'bad' },
      { content, at: 'yesterday' }
    ]) {
      expect(body.safeParse(selection).success).toBe(false)
    }
    const response = evaluateClauseSheet.responses[200].content['application/json'].schema
    expect(response.shape.label.safeParse('replay').success).toBe(true)
    expect(response.shape.label.safeParse('live').success).toBe(true)
    expect(response.shape.explanations.safeParse([]).success).toBe(true)
  })

  test('preview selects UUIDv7 drafts and exposes live drift, while publish stays first party', () => {
    expect(getClauseSheetPublishPreview.request.query.safeParse({ draft_id: id }).success).toBe(true)
    expect(getClauseSheetPublishPreview.request.query.safeParse({ draft_id: 'bad' }).success).toBe(false)
    expect(
      publishClauseSheet.request.body.content['application/json'].schema.safeParse({
        draft_id: 'bad',
        preview_hash: 'hash'
      }).success
    ).toBe(false)
    const preview = getClauseSheetPublishPreview.responses[200].content['application/json'].schema
    expect(preview.shape.draft.safeParse(draft).success).toBe(true)
    expect(preview.shape.base_n.safeParse(1).success).toBe(true)
    expect(preview.shape.live_n.safeParse(2).success).toBe(true)
    expect(preview.shape.base_drift.safeParse(true).success).toBe(true)
    expect(routes.some((route) => /approve|publish|send/i.test(route.operationId))).toBe(false)
    for (const route of [evaluateClauseSheet, getClauseSheetPublishPreview, publishClauseSheet])
      expect(route.responses).toHaveProperty('501')
  })
})
