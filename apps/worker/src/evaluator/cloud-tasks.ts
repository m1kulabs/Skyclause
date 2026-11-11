import type { DeadlineIntent } from '@skyclause/db'
import { metadataToken, workerConfig, type CloudTasksOptions } from '../bundles/cloud-tasks'

export const EVALUATOR_DEADLINES = 'evaluator-deadlines'
export const TASK_HORIZON_MS = 30 * 86400000
export interface EvaluatorTaskTransport {
  create(intent: DeadlineIntent): Promise<void>
  remove(taskName: string): Promise<void>
}
/** A 409 can be a tombstone. The controller rotates the durable generation before retrying. */
export class TaskNameUnavailable extends Error {}
export function cloudEvaluatorTasks(o: CloudTasksOptions = {}): EvaluatorTaskTransport {
  const send = o.fetch ?? fetch,
    token = o.token ?? metadataToken(send)
  let config: ReturnType<typeof workerConfig> | undefined
  const get = () => (config ??= (o.config ?? workerConfig)())
  const parent = () => {
    const c = get()
    return `projects/${c.project}/locations/${c.region}/queues/${EVALUATOR_DEADLINES}`
  }
  return {
    async create(intent) {
      const c = get()
      const { org, project, generation, dueAt } = intent
      const response = await send(`https://cloudtasks.googleapis.com/v2/${parent()}/tasks`, {
        method: 'POST',
        headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          task: {
            name: `${parent()}/tasks/${intent.taskName}`,
            scheduleTime: dueAt,
            httpRequest: {
              httpMethod: 'POST',
              url: `${c.workerUrl}/tasks/${EVALUATOR_DEADLINES}`,
              headers: { 'Content-Type': 'application/json' },
              body: Buffer.from(JSON.stringify({ org, project, generation, dueAt })).toString('base64'),
              oidcToken: { serviceAccountEmail: c.invoker, audience: c.workerUrl }
            }
          }
        }),
        signal: AbortSignal.timeout(10000)
      })
      if (response.status === 409)
        throw new TaskNameUnavailable('Cloud Tasks name unavailable; new durable generation required')
      if (!response.ok) throw new Error(`Cloud Tasks create failed: ${response.status}`)
    },
    async remove(taskName) {
      if (!/^eval-[a-zA-Z0-9-]+$/.test(taskName)) throw new Error('Invalid evaluator task name')
      const response = await send(`https://cloudtasks.googleapis.com/v2/${parent()}/tasks/${taskName}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${await token()}` },
        signal: AbortSignal.timeout(10000)
      })
      if (!response.ok && response.status !== 404) throw new Error(`Cloud Tasks delete failed: ${response.status}`)
    }
  }
}
