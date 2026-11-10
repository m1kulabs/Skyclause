import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { canonicalHash, check, type SheetInput } from '@skyclause/clauses'
import skyDefault from '@skyclause/clauses/defaults/sky.json'
import crowdDefault from '@skyclause/clauses/defaults/crowd.json'
import { and, eq } from 'drizzle-orm'
import { beforeAll, expect, test } from 'vitest'
import {
  clause,
  clauseSheet,
  createProjectRecord,
  projectPack,
  sheetVersion,
  withRetention,
  withTenant,
  type Tx
} from '../src'
import * as repository from '../src/clause-sheets'
import { makeClauseSheet, makeOrganization, makeSheetVersion } from './factories'
import { asLogin, memberOf, refusal } from './harness'

let orgId: string
let otherOrgId: string
const rawSheet: SheetInput = {
  pack: 'sky',
  clauses: [
    {
      key: 'constant',
      name: 'Constant',
      enabled: true,
      scope: 'site',
      requires: [],
      when: 'true',
      proposes: { mode: 'normal' },
      wording: { en: 'Clear' }
    }
  ]
}
const checked = check(rawSheet, [])
const validation = {
  check: { ok: checked.ok, publishable: checked.publishable, issues: checked.issues },
  checked: checked.sheet!,
  registryHash: checked.sheet!.registryHash
}
const unavailable = { check: null, checked: null, registryHash: null }
const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal: memberOf(orgId) }, fn)
const save = (tx: Tx, sheet: repository.SheetRow, baseN = 1, available = true) =>
  repository.insertDraft(tx, {
    sheet,
    content: rawSheet,
    contentHash: canonicalHash(rawSheet),
    baseN,
    validation: available ? validation : unavailable
  })

beforeAll(async () => {
  orgId = (await makeOrganization({ slug: 'db-clause-sheets' })).id
  otherOrgId = (await makeOrganization({ slug: 'db-clause-sheets-other' })).id
})

test('independent drafts are unnumbered and unavailable checks stay SQL NULL', async () => {
  const drafts = await inOrg(async (tx) => {
    const sheet = await makeClauseSheet(tx)
    return [await save(tx, sheet), await save(tx, sheet, 1, false)]
  })
  expect(drafts.map((d) => d.n)).toEqual([null, null])
  expect(new Set(drafts.map((d) => d.id)).size).toBe(2)
  expect(drafts[1]!.checkResult).toBeNull()
  expect(drafts[1]!.checkedContent).toBeNull()
  const stored = await asLogin('postgres', (client) =>
    client.query(
      'SELECT check_result IS NULL AS check_null, checked_content IS NULL AS checked_null FROM sheet_version WHERE id = $1',
      [drafts[1]!.id]
    )
  )
  expect(stored.rows[0]).toEqual({ check_null: true, checked_null: true })
})

test('CLS-1 actual project initialization preserves both defaults then publishes version 2', async () => {
  const now = new Date('2026-11-10T00:00:00Z')
  const result = await inOrg(async (tx) => {
    const created = await createProjectRecord(
      tx,
      {
        name: 'Clause defaults',
        slug: 'clause-defaults',
        siteName: 'APU',
        siteLat: 3.0553,
        siteLon: 101.7005,
        packs: ['sky']
      },
      now
    )
    for (const pack of ['sky', 'crowd'] as const) {
      const sheet = created.sheets.find((s) => s.pack === pack)!
      const version = await repository.versionByN(tx, sheet.id, 1)
      const content = pack === 'sky' ? skyDefault : crowdDefault
      expect(version).toMatchObject({
        status: 'published',
        n: 1,
        content,
        contentHash: canonicalHash(content),
        publishedBy: null,
        publishedAt: now
      })
      expect(sheet.liveVersionId).toBe(version!.id)
      const [binding] = await tx
        .select()
        .from(projectPack)
        .where(and(eq(projectPack.projectId, created.project.id), eq(projectPack.pack, pack)))
      expect(binding!.sheetId).toBe(sheet.id)
    }
    const sheet = created.sheets.find((s) => s.pack === 'sky')!
    const draft = await save(tx, sheet)
    await save(tx, sheet)
    const published = await repository.promoteDraft(tx, {
      sheet,
      draft,
      n: 2,
      accountId: randomUUID(),
      publishedAt: now,
      validation
    })
    expect((await repository.sheetById(tx, sheet.id))!.liveVersionId).toBe(published.id)
    const projection = await tx.select().from(clause).where(eq(clause.sheetVersionId, published.id))
    expect(projection).toMatchObject([{ key: 'constant', when: 'true', proposes: { mode: 'normal' } }])
    return published
  })
  expect(result.n).toBe(2)
  expect(result.content).toEqual(rawSheet)
  expect(result.contentHash).toBe(canonicalHash(rawSheet))
  expect(result.checkedContent).toHaveProperty('registryTypes')
})

test('draft_base_survives_live_drift', async () => {
  await inOrg(async (tx) => {
    const sheet = await makeClauseSheet(tx)
    const old = await save(tx, sheet)
    const newer = await save(tx, sheet)
    await repository.promoteDraft(tx, {
      sheet,
      draft: newer,
      n: 2,
      accountId: randomUUID(),
      publishedAt: new Date(),
      validation
    })
    expect((await repository.draftById(tx, sheet.id, old.id))!.baseN).toBe(1)
  })
})

test('concurrent_saves_do_not_consume_published_numbers', async () => {
  const sheet = await inOrg((tx) => makeClauseSheet(tx))
  const drafts = await Promise.all(Array.from({ length: 5 }, () => inOrg((tx) => save(tx, sheet))))
  expect(drafts.map((d) => d.n)).toEqual([null, null, null, null, null])
  expect(new Set(drafts.map((d) => d.id)).size).toBe(5)
})

test('published_update_and_delete_are_rejected', async () => {
  const version = await inOrg((tx) => makeSheetVersion(tx, { status: 'published', n: 1 }))
  expect(
    await refusal(
      inOrg((tx) => tx.update(sheetVersion).set({ contentHash: 'changed' }).where(eq(sheetVersion.id, version.id)))
    )
  ).toMatch(/published.*immutable/i)
  expect(await refusal(inOrg((tx) => tx.delete(sheetVersion).where(eq(sheetVersion.id, version.id))))).toMatch(
    /published.*immutable/i
  )
})

test('draft_delete_does_not_delete_publication', async () => {
  await inOrg(async (tx) => {
    const sheet = await makeClauseSheet(tx)
    const published = await makeSheetVersion(tx, { sheetId: sheet.id, status: 'published', n: 1 })
    const draft = await save(tx, sheet)
    expect(await repository.deleteDraft(tx, sheet.id, published.id)).toBeNull()
    expect(await repository.deleteDraft(tx, sheet.id, draft.id)).toBe(draft.id)
    expect(await repository.versionByN(tx, sheet.id, 1)).toMatchObject({ id: published.id })
    expect(await repository.draftById(tx, sheet.id, draft.id)).toBeNull()
  })
})

test('draft_ids_are_scoped_to_parent', async () => {
  await inOrg(async (tx) => {
    const first = await makeClauseSheet(tx)
    const other = await makeClauseSheet(tx)
    const draft = await save(tx, first)
    expect(await repository.draftById(tx, other.id, draft.id, true)).toBeNull()
    expect(await repository.deleteDraft(tx, other.id, draft.id)).toBeNull()
    expect(await repository.versionByN(tx, first.id, 1)).toBeNull()
  })
})

test('raw_content_never_contains_checked_metadata', async () => {
  await inOrg(async (tx) => {
    const draft = await save(tx, await makeClauseSheet(tx))
    expect(draft.content).toEqual(rawSheet)
    expect(draft.content).not.toHaveProperty('contentHash')
    expect(draft.content).not.toHaveProperty('registryTypes')
    expect(draft.checkedContent).toEqual(validation.checked)
  })
})

test('normalizes_draft_numbers_to_null_without_touching_published_rows', async () => {
  const records = await inOrg(async (tx) => {
    const sheet = await makeClauseSheet(tx)
    const published = await makeSheetVersion(tx, { sheetId: sheet.id, status: 'published', n: 1 })
    await tx.update(clauseSheet).set({ liveVersionId: published.id }).where(eq(clauseSheet.id, sheet.id))
    const draft = await save(tx, sheet)
    return { sheet, published, draft }
  })
  const migrations = new URL('../migrations/', import.meta.url)
  const filename = readdirSync(migrations).find((name) => name.endsWith('_b-clause-sheets-api-versions.sql'))!
  const migration = readFileSync(new URL(filename, migrations), 'utf8')
  const normalization = migration
    .split('--> statement-breakpoint')
    .find((statement) => statement.trim().startsWith('UPDATE "sheet_version"'))!
  expect(normalization).toBeDefined()
  await asLogin('postgres', async (client) => {
    await client.query('BEGIN')
    try {
      await client.query('ALTER TABLE sheet_version DROP CONSTRAINT sheet_version_status_n_check')
      await client.query('UPDATE sheet_version SET n = 9 WHERE id = $1', [records.draft.id])
      await client.query(normalization)
      const after = await client.query('SELECT n FROM sheet_version WHERE id = $1', [records.draft.id])
      expect(after.rows[0].n).toBeNull()
      const published = await client.query(
        'SELECT n, content, content_hash, published_by, published_at FROM sheet_version WHERE id = $1',
        [records.published.id]
      )
      expect(published.rows[0]).toEqual({
        n: 1,
        content: records.published.content,
        content_hash: records.published.contentHash,
        published_by: records.published.publishedBy,
        published_at: records.published.publishedAt
      })
      const sheet = await client.query('SELECT live_version_id FROM clause_sheet WHERE id = $1', [records.sheet.id])
      expect(sheet.rows[0].live_version_id).toBe(records.published.id)
    } finally {
      await client.query('ROLLBACK')
    }
  })
})

test('retention alone may delete publications while tenant scope and all update guards remain intact', async () => {
  const published = await inOrg((tx) => makeSheetVersion(tx, { status: 'published', n: 1 }))
  await withTenant({ orgId: otherOrgId, principal: memberOf(otherOrgId) }, async (tx) => {
    expect(await repository.sheetById(tx, published.sheetId)).toBeNull()
    expect(await repository.versionByN(tx, published.sheetId, 1)).toBeNull()
    expect(await tx.delete(sheetVersion).where(eq(sheetVersion.id, published.id)).returning()).toEqual([])
  })
  expect(
    await refusal(
      withRetention('test:publication-update', (tx) =>
        tx.update(sheetVersion).set({ contentHash: 'changed' }).where(eq(sheetVersion.id, published.id))
      )
    )
  ).toMatch(/published.*immutable/i)
  const deleted = await withRetention('test:publication-delete', (tx) =>
    tx.delete(sheetVersion).where(eq(sheetVersion.id, published.id)).returning({ id: sheetVersion.id })
  )
  expect(deleted).toEqual([{ id: published.id }])
})

test('status check rejects numbered drafts and null or nonpositive publications', async () => {
  for (const invalid of [
    { status: 'draft' as const, n: 1 },
    { status: 'published' as const, n: null },
    { status: 'published' as const, n: 0 },
    { status: 'published' as const, n: -1 }
  ]) {
    expect(await refusal(inOrg((tx) => makeSheetVersion(tx, invalid)))).toMatch(/sheet_version_status_n_check/)
  }
})
