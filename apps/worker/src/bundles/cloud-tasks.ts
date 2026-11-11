import { loadEnv } from '@skyclause/config'

// #79 §5 and D45: a timer is a Cloud Tasks task at its due time, calling the worker's `POST /tasks/<queue>` with an
// OIDC token for WORKER_INVOKER_SA and audience WORKER_URL, which `server.ts` checks. Over the REST API
// (`projects.locations.queues.tasks.create`), with the service's own token from the metadata server.

/** One task: `name` is its ID in the queue (such as `expiry-{call_id}`), so creating it again is a no-op. */
export interface TimerTask {
  queue: string
  name: string
  at: Date
  body: unknown
}

export type ScheduleTask = (task: TimerTask) => Promise<void>

export interface CloudTasksOptions {
  /** GCP_PROJECT, GCP_REGION, WORKER_URL and WORKER_INVOKER_SA; read from the worker env on first use by default. */
  config?: () => { project: string; region: string; workerUrl: string; invoker: string }
  /** Doubles for tests. */
  fetch?: typeof fetch
  /** The bearer token for Cloud Tasks; by default the service account's, from the metadata server. */
  token?: () => Promise<string>
}

const TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token'

export function workerConfig() {
  const env = loadEnv('worker')
  if (!env.GCP_PROJECT || !env.GCP_REGION) throw new Error('Cloud Tasks needs GCP_PROJECT and GCP_REGION (f-infra)')
  return { project: env.GCP_PROJECT, region: env.GCP_REGION, workerUrl: env.WORKER_URL, invoker: env.WORKER_INVOKER_SA }
}

/** The metadata server's token for the service account, kept until a minute before it expires. */
export function metadataToken(send: typeof fetch) {
  let held: { token: string; until: number } | undefined
  return async () => {
    if (held && held.until > Date.now()) return held.token
    const response = await send(TOKEN_URL, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(5_000)
    })
    if (!response.ok) throw new Error(`metadata token failed: ${response.status}`)
    const { access_token, expires_in } = (await response.json()) as { access_token: string; expires_in: number }
    held = { token: access_token, until: Date.now() + (expires_in - 60) * 1000 }
    return access_token
  }
}

/** Creates each task once: a 409 (the name exists, as on a redelivered event) counts as done; other failures throw. */
export function cloudTasks(o: CloudTasksOptions = {}): ScheduleTask {
  const send = o.fetch ?? fetch
  const token = o.token ?? metadataToken(send)
  let config: ReturnType<typeof workerConfig> | undefined
  return async ({ queue, name, at, body }) => {
    config ??= (o.config ?? workerConfig)()
    const { project, region, workerUrl, invoker } = config
    const parent = `projects/${project}/locations/${region}/queues/${queue}`
    const response = await send(`https://cloudtasks.googleapis.com/v2/${parent}/tasks`, {
      method: 'POST',
      headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        task: {
          name: `${parent}/tasks/${name}`,
          scheduleTime: at.toISOString(),
          httpRequest: {
            httpMethod: 'POST',
            url: `${workerUrl}/tasks/${queue}`,
            headers: { 'Content-Type': 'application/json' },
            body: Buffer.from(JSON.stringify(body)).toString('base64'),
            oidcToken: { serviceAccountEmail: invoker, audience: workerUrl }
          }
        }
      }),
      signal: AbortSignal.timeout(10_000)
    })
    const said = await response.text()
    if (response.ok || response.status === 409) return
    throw new Error(`Cloud Tasks ${queue}/${name} failed: ${response.status} ${said.slice(0, 200)}`)
  }
}
