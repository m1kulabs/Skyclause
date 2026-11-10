import { notBuilt } from '@skyclause/contracts'
import { createChainResolver } from '@skyclause/agent'
import { budgetGate, loadAiKeyRows, RUNS_REQUESTED, type Tx } from '@skyclause/db'
import { modelFor } from '../ai-keys/model-for'
import { z } from 'zod'
import type { WorkerPart } from '../server'
import { republishQueuedRuns, requestScheduledRuns } from './batch'
import { runConsumers } from './consumers'
import { executeRun, type RunHooks, type RunPorts } from './execute'

// #151 c-run-orchestrator's worker part: the `runs-requested` handler (#79 §5).

export { executeRun, RUNS_JOB, shadowMode, type RunHooks, type RunPorts } from './execute'
export { crossingWithoutBundle } from './audit'
export { DEFAULT_SKY_SCHEDULE, parseSchedule, republishQueuedRuns, requestScheduledRuns } from './batch'
export { startsRun, type CrossingFacts } from './start-rule'

const RunMessage = z.object({ run_id: z.string(), org_id: z.string() })

export function createRunsPart(ports: RunPorts, hooks: RunHooks = {}): WorkerPart {
  return {
    owner: 'c-run-orchestrator',
    topics: {
      [RUNS_REQUESTED]: async ({ data }) => {
        const { run_id, org_id } = RunMessage.parse(data)
        await executeRun(ports, { orgId: org_id, runId: run_id }, hooks)
      }
    },
    events: runConsumers,
    batch: {
      'runs-sky-schedule': requestScheduledRuns,
      'runs-republish': async (now) => void (await republishQueuedRuns(now))
    }
  }
}

const origins = () => [
  ...new Set([process.env.MARKETING_ORIGIN, process.env.APP_ORIGIN].filter((o): o is string => Boolean(o)))
]

/**
 * Production ports. SnapshotSource and ShadowEvaluator (#133) aren't built: until each owner swaps in its
 * implementation here, a run fails at its first step that calls one. ModelResolver and modelFor (#206) are live.
 */
export const runs = createRunsPart({
  snapshots: notBuilt('b-evaluator'),
  shadow: notBuilt('b-evaluator'),
  budget: budgetGate,
  models: createChainResolver((tx, q) => loadAiKeyRows(tx as Tx, q)),
  modelFor,
  ...(process.env.GCP_PROJECT && process.env.VERTEX_LOCATION
    ? { vertex: { project: process.env.GCP_PROJECT, location: process.env.VERTEX_LOCATION } }
    : {}),
  origins: origins(),
  now: () => new Date()
})
