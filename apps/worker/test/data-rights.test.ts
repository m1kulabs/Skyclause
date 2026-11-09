import { inflateRawSync } from 'node:zlib'
import { randomUUID } from 'node:crypto'
import { and, count, eq } from 'drizzle-orm'
import type { EmailTransport } from '@skyclause/contracts'
import {
  call,
  createExportJob,
  deleteAccount,
  exportJob,
  notice,
  organization,
  systemPrincipal,
  withSystem,
  withTenant,
  type Tx
} from '@skyclause/db'
import { authDatabase } from '@skyclause/db/auth'
import { makeBundle, makeCall, makeOrganization, makeProject, makeUser } from '@skyclause/db/test/factories/index'
import { expect, test } from 'vitest'
import { createDataRightsPart, type DataRightsBucket } from '../src/data-rights'

const principal = systemPrincipal('test:data-rights')
const inOrg = <T>(orgId: string, fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal }, fn)

function unzip(buffer: Buffer) {
  const files = new Map<string, Buffer>()
  let offset = 0
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8)
    const compressedLength = buffer.readUInt32LE(offset + 18)
    const nameLength = buffer.readUInt16LE(offset + 26)
    const extraLength = buffer.readUInt16LE(offset + 28)
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString('utf8')
    const dataStart = offset + 30 + nameLength + extraLength
    const compressed = buffer.subarray(dataStart, dataStart + compressedLength)
    files.set(name, method === 8 ? inflateRawSync(compressed) : compressed)
    offset = dataStart + compressedLength
  }
  return files
}

test('an export task writes one ZIP with matching per-project call counts and sends one system notice', async () => {
  const org = await makeOrganization()
  const requester = await makeUser({ email: `export-${randomUUID()}@example.test` })
  const projectIds = await inOrg(org.id, async (tx) => {
    const ids: string[] = []
    for (let i = 0; i < 2; i += 1) {
      const project = await makeProject(tx)
      const bundle = await makeBundle(tx, { projectId: project.id })
      await makeCall(tx, { bundleId: bundle.id })
      ids.push(project.id)
    }
    return ids
  })
  const now = new Date('2026-11-08T02:00:00Z')
  const job = await createExportJob({
    scope: 'organisation',
    orgId: org.id,
    accountId: requester.id,
    formats: ['json', 'csv'],
    now
  })
  const objects = new Map<string, Buffer>()
  const bucket: DataRightsBucket = {
    name: 'exports',
    async write(path, contents) {
      objects.set(path, Buffer.from(contents))
    },
    async deleteObject(path) {
      objects.delete(path)
    },
    async deletePrefix(prefix) {
      let removed = 0
      for (const path of objects.keys()) {
        if (path.startsWith(prefix)) {
          objects.delete(path)
          removed += 1
        }
      }
      return removed
    }
  }
  const sent: Parameters<EmailTransport['send']>[0][] = []
  const email: EmailTransport = {
    async send(message) {
      sent.push(message)
      return { providerMessageId: `mailbox-${sent.length}` }
    }
  }
  const part = createDataRightsPart({
    exportBucket: bucket,
    orgBuckets: [bucket],
    email: () => email,
    appOrigin: () => 'https://app.example.test',
    now: () => now
  })

  await part.queues!.exports!({ name: 'export-test', retryCount: 0, body: { export_id: job.id } })

  const [objectPath, archive] = [...objects][0]!
  expect(objectPath).toBe(`orgs/${org.id}/exports/${job.id}.zip`)
  expect(archive!.readUInt32LE(0)).toBe(0x04034b50)
  const files = unzip(archive!)
  const manifest = JSON.parse(files.get('manifest.json')!.toString('utf8')) as {
    generated_at: string
    projects: Record<string, { calls: number }>
  }
  expect(manifest.generated_at).toBe(now.toISOString())
  const expected = await inOrg(org.id, async (tx) => {
    const rows = await tx.select({ projectId: call.projectId, calls: count() }).from(call).groupBy(call.projectId)
    return new Map(rows.map((row) => [row.projectId, row.calls]))
  })
  const csvRows = files.get('calls.csv')!.toString('utf8').trim().split('\n').slice(1)
  expect(csvRows).toHaveLength(2)
  for (const projectId of projectIds) {
    const rowsForProject = csvRows.filter((row) => row.split(',')[0] === projectId)
    expect(manifest.projects[projectId]!.calls).toBe(expected.get(projectId))
    expect(rowsForProject).toHaveLength(expected.get(projectId)!)
  }

  expect(sent).toHaveLength(1)
  expect(sent[0]).toMatchObject({ to: requester.email, from: 'system', category: 'export_ready' })
  const [ready] = await withSystem('test:data-rights', (tx) =>
    tx.select().from(exportJob).where(eq(exportJob.id, job.id))
  )
  expect(ready).toMatchObject({
    status: 'ready',
    objectPath,
    expiresAt: new Date(now.getTime() + 7 * 86_400_000),
    error: null
  })
  const notices = await withTenant({ orgId: org.id, principal }, (tx) =>
    tx
      .select()
      .from(notice)
      .where(and(eq(notice.kind, 'export_ready'), eq(notice.accountId, requester.id)))
  )
  expect(notices).toHaveLength(1)
})

test('an account export writes under its account prefix without auth secrets', async () => {
  const account = await makeUser({ name: 'Archive account', email: `account-export-${randomUUID()}@example.test` })
  const now = new Date('2026-11-08T02:00:00Z')
  const job = await createExportJob({
    scope: 'account',
    orgId: null,
    accountId: account.id,
    formats: ['json', 'csv'],
    now
  })
  const objects = new Map<string, Buffer>()
  const bucket: DataRightsBucket = {
    name: 'exports',
    async write(path, contents) {
      objects.set(path, Buffer.from(contents))
    },
    async deleteObject(path) {
      objects.delete(path)
    },
    async deletePrefix(prefix) {
      let removed = 0
      for (const path of objects.keys()) {
        if (path.startsWith(prefix)) {
          objects.delete(path)
          removed += 1
        }
      }
      return removed
    }
  }
  const sent: Parameters<EmailTransport['send']>[0][] = []
  const part = createDataRightsPart({
    exportBucket: bucket,
    orgBuckets: [bucket],
    email: () => ({
      send: async (message) => {
        sent.push(message)
        return { providerMessageId: 'account-mail' }
      }
    }),
    appOrigin: () => 'https://app.example.test',
    now: () => now
  })

  await part.queues!.exports!({ name: 'account-export-test', retryCount: 0, body: { export_id: job.id } })

  const [objectPath, archive] = [...objects][0]!
  expect(objectPath).toBe(`accounts/${account.id}/exports/${job.id}.zip`)
  const files = unzip(archive)
  expect(JSON.parse(files.get('profile.json')!.toString('utf8'))).toMatchObject({
    id: account.id,
    email: account.email
  })
  expect(files.has('profile.csv')).toBe(true)
  expect(files.has('manifest.json')).toBe(true)
  expect(sent).toHaveLength(1)
  expect(sent[0]).toMatchObject({ to: account.email, from: 'system', category: 'export_ready' })
  const [ready] = await withSystem('test:data-rights', (tx) =>
    tx.select().from(exportJob).where(eq(exportJob.id, job.id))
  )
  expect(ready).toMatchObject({ status: 'ready', objectPath, expiresAt: new Date(now.getTime() + 7 * 86_400_000) })
})

test('the org:purge job empties every configured bucket prefix and removes the organisation', async () => {
  const org = await makeOrganization()
  const deletionAt = new Date('2026-10-01T00:00:00Z')
  await authDatabase()
    .update(organization)
    .set({ deletionRequestedAt: deletionAt, purgeAfter: new Date(deletionAt.getTime() + 30 * 86_400_000) })
    .where(eq(organization.id, org.id))
  const buckets = ['exports', 'frames', 'archive', 'scratch', 'sources'].map((name) => {
    const objects = new Set([`orgs/${org.id}/file.bin`, `orgs/${randomUUID()}/other.bin`])
    const bucket: DataRightsBucket = {
      name,
      async write(path) {
        objects.add(path)
      },
      async deleteObject(path) {
        objects.delete(path)
      },
      async deletePrefix(prefix) {
        let removed = 0
        for (const path of objects) {
          if (path.startsWith(prefix)) {
            objects.delete(path)
            removed += 1
          }
        }
        return removed
      }
    }
    return { bucket, objects }
  })
  const part = createDataRightsPart({
    exportBucket: buckets[0]!.bucket,
    orgBuckets: buckets.map(({ bucket }) => bucket),
    email: () => ({ send: async () => ({ providerMessageId: 'unused' }) }),
    appOrigin: () => 'https://app.example.test',
    now: () => new Date('2026-11-08T02:00:00Z')
  })

  await part.jobs!['org:purge']!([])

  expect(buckets.map(({ objects }) => [...objects].filter((path) => path.startsWith(`orgs/${org.id}/`)))).toEqual([
    [],
    [],
    [],
    [],
    []
  ])
  expect(await authDatabase().select().from(organization).where(eq(organization.id, org.id))).toEqual([])
})

test('an account deleted during archive upload leaves no export object or ready email', async () => {
  const account = await makeUser({ name: 'Deleting account', email: `delete-race-${randomUUID()}@example.test` })
  const now = new Date('2026-11-08T02:00:00Z')
  const job = await createExportJob({ scope: 'account', orgId: null, accountId: account.id, formats: ['json'], now })
  const objects = new Map<string, Buffer>()
  const bucket: DataRightsBucket = {
    name: 'exports',
    async write(path, contents) {
      objects.set(path, Buffer.from(contents))
      await deleteAccount({ accountId: account.id, email: account.email, actor: principal, now })
    },
    async deleteObject(path) {
      objects.delete(path)
    },
    async deletePrefix(prefix) {
      let removed = 0
      for (const path of objects.keys()) {
        if (path.startsWith(prefix)) {
          objects.delete(path)
          removed += 1
        }
      }
      return removed
    }
  }
  const sent: Parameters<EmailTransport['send']>[0][] = []
  const part = createDataRightsPart({
    exportBucket: bucket,
    orgBuckets: [bucket],
    email: () => ({
      send: async (message) => {
        sent.push(message)
        return { providerMessageId: 'race-mail' }
      }
    }),
    appOrigin: () => 'https://app.example.test',
    now: () => now
  })

  await part.queues!.exports!({ name: 'account-delete-race', retryCount: 0, body: { export_id: job.id } })

  expect(objects.size).toBe(0)
  expect(sent).toEqual([])
  expect(
    await withSystem('test:data-rights', (tx) => tx.select().from(exportJob).where(eq(exportJob.id, job.id)))
  ).toEqual([])
})
