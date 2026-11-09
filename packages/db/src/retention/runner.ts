// #112 (a-retention): the nightly retention runner. It lists every organisation, runs each `org` sweeper per
// organisation and each `global` sweeper once, and logs one line per sweeper per organisation with counts only, never
// a person's data. A failing sweeper is logged and the run goes on; the runner throws at the end, so the job exits
// non-zero (D9). The clock, the erasure and the buckets are injected; the erasure defaults to #110's.

import { log } from '@skyclause/config'
import type { EraseSubscriber } from '@skyclause/contracts'
import { withRetention } from '../client'
import { eraseSubscriber } from '../placeholders/a-subscriber-rights'
import type { RetentionBuckets } from './buckets'
import { JOB, listOrganizationIds, SWEEPERS, type SweepCounts, type SweepDeps } from './sweepers'

export interface RetentionDeps {
  /** Defaults to #110's `eraseSubscriber`; tests pass a double until it merges. */
  eraseSubscriber?: EraseSubscriber
  buckets: RetentionBuckets
}

/** Runs every sweeper; throws naming each failed sweeper once they have all had their turn. */
export async function runRetentionSweep(now: Date, deps: RetentionDeps): Promise<void> {
  const full: SweepDeps = { eraseSubscriber: deps.eraseSubscriber ?? eraseSubscriber, buckets: deps.buckets }
  const orgs = await listOrganizationIds()
  const failures: string[] = []
  const sweep = async (name: string, orgId: string | null, work: () => Promise<SweepCounts>) => {
    try {
      const counts = await work()
      // Counts and IDs only: never an address, a name or an account ID.
      log.info('retention sweep', { sweeper: name, org_id: orgId, ...counts })
    } catch (error) {
      log.error('retention sweeper failed', { sweeper: name, org_id: orgId, error: String(error) })
      failures.push(orgId === null ? name : `${name}/${orgId}`)
    }
  }
  for (const orgId of orgs) {
    for (const sweeper of SWEEPERS.filter(({ scope }) => scope === 'org')) {
      const run = sweeper.run
      await sweep(sweeper.name, orgId, () => withRetention(JOB, (tx) => run(tx, { orgId, now }, full)))
    }
  }
  for (const sweeper of SWEEPERS.filter(({ unscoped }) => unscoped)) {
    const run = sweeper.run
    await sweep(sweeper.name, null, () => withRetention(JOB, (tx) => run(tx, { orgId: null, now }, full)))
  }
  for (const sweeper of SWEEPERS.filter(({ scope }) => scope === 'global')) {
    const run = sweeper.run
    await sweep(sweeper.name, null, () => withRetention(JOB, (tx) => run(tx, { orgId: null, now }, full)))
  }
  if (failures.length) throw new Error(`retention failed for ${failures.length} sweep(s): ${failures.join(', ')}`)
}
