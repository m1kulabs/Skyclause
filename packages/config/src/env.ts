import { z } from 'zod'

// Spec §6. Owners add their variables to the service that reads them.
const base = z.object({
  APP_ENV: z.enum(['dev', 'staging', 'production', 'test'])
})

const schemas = {
  web: base,
  worker: base.extend({
    WORKER_URL: z.url(),
    WORKER_INVOKER_SA: z.email(),
    PORT: z.coerce.number().int().positive().default(8080)
  }),
  job: base
}

export type Service = keyof typeof schemas
export type Env<S extends Service> = z.infer<(typeof schemas)[S]>

export function loadEnv<S extends Service>(
  service: S,
  source: Record<string, string | undefined> = process.env
): Env<S> {
  if (source.APP_ENV === 'test' && (source.K_SERVICE || source.CLOUD_RUN_JOB)) {
    throw new Error('APP_ENV=test is refused on Cloud Run (K_SERVICE or CLOUD_RUN_JOB is set)')
  }
  const result = schemas[service].safeParse(source)
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    throw new Error(`${service} environment is invalid: ${problems.join('; ')}`)
  }
  return result.data as Env<S>
}
