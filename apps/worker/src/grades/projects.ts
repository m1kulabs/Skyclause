import { systemPrincipal, withTenant, type Tx } from '@skyclause/db'
import { log } from '../server'

/**
 * Grades each project in its own `withTenant` transaction as the job's system principal. A project that fails is
 * logged and rolled back while the rest go on; the job then fails, naming them, so the next run retries (D9).
 */
export async function forEachProject<P extends { orgId: string; projectId: string; timeZone: string }>(
  job: string,
  projects: P[],
  grade: (tx: Tx, p: P) => Promise<number>
) {
  const failures: string[] = []
  let graded = 0
  for (const p of projects) {
    try {
      graded += await withTenant({ orgId: p.orgId, principal: systemPrincipal(job) }, (tx) => grade(tx, p))
    } catch (error) {
      log('ERROR', `${job}: project failed`, { projectId: p.projectId, error: String(error) })
      failures.push(p.projectId)
    }
  }
  log('INFO', `${job}: done`, { projects: projects.length, graded })
  if (failures.length) throw new Error(`${job} failed for ${failures.length} project(s): ${failures.join(', ')}`)
}
