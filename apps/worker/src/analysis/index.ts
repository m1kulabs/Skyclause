import { analysisProjects, materialiseAnalysis, systemPrincipal, withSystem, withTenant } from '@skyclause/db'
import { log, type WorkerPart } from '../server'

// #162 c-analysis-api (TRD grading): `node main.js job analysis-materialise` at 00:30 and 06:40 MYT, after the
// graders' 23:55 and 06:30 runs.

const JOB = 'analysis-materialise'

/**
 * Rewrites every project's figures as of `now`, each in its own `withTenant` transaction as the job's system
 * principal. A project that fails is logged and keeps its last figures while the rest go on; the job then fails,
 * naming them, so the next run retries.
 */
export async function materialiseAll(now: Date) {
  const projects = await withSystem(JOB, (tx) => analysisProjects(tx))
  const failures: string[] = []
  let figures = 0
  for (const p of projects) {
    try {
      figures += await withTenant({ orgId: p.orgId, principal: systemPrincipal(JOB) }, (tx) =>
        materialiseAnalysis(tx, { projectId: p.projectId, now })
      )
    } catch (error) {
      log('ERROR', `${JOB}: project failed`, { projectId: p.projectId, error: String(error) })
      failures.push(p.projectId)
    }
  }
  log('INFO', `${JOB}: done`, { projects: projects.length, figures })
  if (failures.length) throw new Error(`${JOB} failed for ${failures.length} project(s): ${failures.join(', ')}`)
}

export const analysis: WorkerPart = {
  owner: 'c-analysis-api',
  jobs: { [JOB]: () => materialiseAll(new Date()) }
}
