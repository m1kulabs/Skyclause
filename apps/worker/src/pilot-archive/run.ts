import {
  findPilotProject,
  recordPilotArchive,
  systemPrincipal,
  withSystem,
  withTenant,
  type PilotArchiveKind
} from '@skyclause/db'

// #146 ticket decision, archive (LED-8): after 17 November a person uploads the pilot's exports to
// ARCHIVE_BUCKET/incoming/, each with `kind` and `captured-at` metadata, and runs this once. It copies each file to
// orgs/{org_id}/pilot/{kind}/{sha256}-{name} and records it for PILOT_PROJECT. It never appends to the ledger, and it
// reads the exports as bytes, importing nothing from pilot/ (D10).

export interface ArchiveObject {
  name: string
  /** The object's custom metadata. */
  metadata: Record<string, string>
}

/** ARCHIVE_BUCKET, as the job uses it. */
export interface ArchiveBucket {
  list(prefix: string): Promise<ArchiveObject[]>
  /** SHA-256 hex of the object's bytes. */
  sha256(name: string): Promise<string>
  /** Copies `from` to `to` unless `to` exists, which it never overwrites. */
  copy(from: string, to: string): Promise<'copied' | 'exists'>
}

const JOB = 'pilot-archive'
const INCOMING = 'incoming/'
const KINDS: readonly PilotArchiveKind[] = ['sheets_ledger', 'jira_register', 'run_traces']
const RFC_3339 = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$/

/** The object's file name, kept to characters safe in a path (and never an email address in an audit row). */
const fileName = (name: string) => name.slice(name.lastIndexOf('/') + 1).replace(/[^A-Za-z0-9._-]/g, '_')

export async function archivePilotRecords(bucket: ArchiveBucket, pilotProject: string) {
  const { orgId, projectId } = await withSystem(JOB, (tx) => findPilotProject(tx, pilotProject))
  const objects = (await bucket.list(INCOMING)).filter(({ name }) => !name.endsWith('/'))
  if (!objects.length) throw new Error(`pilot-archive found nothing under ${INCOMING}`)
  const problems: string[] = []
  const files = objects.flatMap(({ name, metadata }) => {
    const kind = metadata.kind as PilotArchiveKind
    const capturedAt = metadata['captured-at'] ?? ''
    if (!KINDS.includes(kind)) problems.push(`${name}: metadata kind must be one of ${KINDS.join(', ')}`)
    else if (!RFC_3339.test(capturedAt) || Number.isNaN(Date.parse(capturedAt)))
      problems.push(`${name}: metadata captured-at must be an RFC 3339 instant`)
    else return [{ name, kind, capturedAt: new Date(capturedAt) }]
    return []
  })
  if (problems.length) throw new Error(`pilot-archive refused the run: ${problems.join('; ')}`)

  const results = []
  for (const { name, kind, capturedAt } of files) {
    const sha256 = await bucket.sha256(name)
    const objectPath = `orgs/${orgId}/pilot/${kind}/${sha256}-${fileName(name)}`
    const copied = await bucket.copy(name, objectPath)
    const { created } = await withTenant({ orgId, principal: systemPrincipal(JOB) }, (tx) =>
      recordPilotArchive(tx, { projectId, kind, objectPath, sha256, capturedAt })
    )
    results.push({ kind, sha256, objectPath, copied, created })
  }
  return results
}
