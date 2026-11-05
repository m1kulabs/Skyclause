import { z } from 'zod'

// Spec §6. Owners add their variables to the service that reads them.
const base = z.object({
  APP_ENV: z.enum(['dev', 'staging', 'production', 'test'])
})

// a-email-transport (#113): infra/aws's app_config output. Optional until gate 4B, then all of a
// service's set together.
const arn = (service: string) => z.string().regex(new RegExp(`^arn:aws:${service}:[a-z0-9-]*:\\d{12}:.+$`))
const sending = {
  SES_REGION: z.string().regex(/^[a-z]{2}(-[a-z]+)+-\d$/),
  SES_CONFIGURATION_SET: z.string().min(1),
  EMAIL_FROM_AUTH: z.string().min(1),
  EMAIL_FROM_NOTICES: z.string().min(1),
  AWS_ROLE_ARN: arn('iam')
}
const receiving = {
  SES_EVENTS_SNS_TOPIC_ARN: arn('sns'),
  INBOUND_DOMAIN: z.string().min(1),
  INBOUND_BUCKET: z.string().min(1),
  INBOUND_SNS_TOPIC_ARN: arn('sns')
}

function optional<T extends Record<string, z.ZodType>>(shape: T) {
  return Object.fromEntries(Object.entries(shape).map(([name, type]) => [name, type.optional()])) as {
    [K in keyof T]: z.ZodOptional<T[K]>
  }
}

function together(names: string[]) {
  return (env: Record<string, unknown>, ctx: z.RefinementCtx) => {
    const missing = names.filter((name) => env[name] === undefined)
    if (missing.length && missing.length < names.length) {
      for (const name of missing)
        ctx.addIssue({ code: 'custom', path: [name], message: 'set with the other email variables' })
    }
  }
}

const schemas = {
  web: base.extend(optional(sending)).superRefine(together(Object.keys(sending))),
  worker: base
    .extend({
      WORKER_URL: z.url(),
      WORKER_INVOKER_SA: z.email(),
      PORT: z.coerce.number().int().positive().default(8080),
      ...optional(sending),
      ...optional(receiving)
    })
    .superRefine(together([...Object.keys(sending), ...Object.keys(receiving)])),
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
