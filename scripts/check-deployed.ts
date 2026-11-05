// `check-deployed.ts [--image <ref>] <list.json>...` (#90): reads `gcloud run services list` and `gcloud run jobs list`
// output (`--format=json`), prints each resource's APP_ENV and image, and fails if any runs APP_ENV=test (#79 §7) or
// has none, or, with --image, runs any other image.
import { readFileSync } from 'node:fs'

interface Container {
  image?: string
  env?: { name: string; value?: string }[]
}

interface Resource {
  metadata?: { name?: string }
  spec?: { template?: { spec?: { containers?: Container[]; template?: { spec?: { containers?: Container[] } } } } }
}

const args = process.argv.slice(2)
const imageFlag = args.indexOf('--image')
const image = imageFlag === -1 ? null : args.splice(imageFlag, 2)[1]
if (image === undefined || args.length === 0) {
  console.error('usage: check-deployed.ts [--image <ref>] <list.json>...')
  process.exit(2)
}

const problems: string[] = []

function check(resource: Resource, file: string) {
  const name = resource.metadata?.name ?? file
  // A service's template holds its containers; a job's template wraps a task template that does.
  const template = resource.spec?.template?.spec
  const containers = template?.containers ?? template?.template?.spec?.containers ?? []
  if (containers.length === 0) problems.push(`${name}: no containers found in ${file}`)
  for (const container of containers) {
    const appEnv = container.env?.find((variable) => variable.name === 'APP_ENV')?.value
    console.log(`${name}: APP_ENV=${appEnv ?? '(unset)'} image=${container.image}`)
    if (appEnv === undefined) problems.push(`${name}: APP_ENV is unset`)
    if (appEnv === 'test') problems.push(`${name}: APP_ENV=test, which never runs on Cloud Run`)
    if (image && container.image !== image) problems.push(`${name}: runs ${container.image}, not ${image}`)
  }
}

for (const file of args) {
  for (const resource of JSON.parse(readFileSync(file, 'utf8')) as Resource[]) check(resource, file)
}
for (const problem of problems) console.error(problem)
process.exitCode = problems.length ? 1 : 0
