// `bun packages/agent/test/evals/run.ts`: the eval suite on the platform's Vertex model, run by hand; pull requests
// never call a live model (decided 8 November 2026), so `bun run test` drives `main` on model doubles instead. Prints
// the report as JSON and Markdown and exits 1 when the gate fails.
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ModelEntry } from '@skyclause/contracts'
import { draftBundle } from '../../src/draft'
import { DRAFT_MODEL } from '../../src/models'
import { cases } from './cases'
import { renderMarkdown, runSuite } from './harness'

const PLATFORM: ModelEntry = {
  provider: DRAFT_MODEL.provider,
  model: DRAFT_MODEL.model,
  keyId: null,
  declaredTier: 'paid'
}

export async function main(
  env: Record<string, string | undefined>,
  now = new Date()
): Promise<{ code: number; json: string | null; markdown: string }> {
  const maxUsd = Number(env.EVAL_MAX_USD)
  const problems = [
    ...(env.EVAL_MAX_USD && Number.isFinite(maxUsd) && maxUsd > 0
      ? []
      : [`EVAL_MAX_USD must be a positive number of US dollars, not ${JSON.stringify(env.EVAL_MAX_USD ?? null)}`]),
    ...(env.GCP_PROJECT ? [] : ['GCP_PROJECT is not set']),
    ...(env.VERTEX_LOCATION ? [] : ['VERTEX_LOCATION is not set'])
  ]
  if (problems.length) {
    return { code: 1, json: null, markdown: `## Agent evals: not run\n\n${problems.map((p) => `- ${p}`).join('\n')}\n` }
  }
  const vertex = { project: env.GCP_PROJECT!, location: env.VERTEX_LOCATION! }
  const report = await runSuite({
    cases: cases(),
    draft: (input) =>
      draftBundle(input, {
        chain: [PLATFORM],
        modelFor: () => Promise.reject(new Error('the eval drafts on the platform Vertex model only')),
        vertex
      }),
    maxUsd,
    now
  })
  return { code: report.passed ? 0 : 1, json: JSON.stringify(report), markdown: renderMarkdown(report) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const run = await main(process.env)
  if (run.json) console.log(run.json)
  console.log(run.markdown)
  process.exitCode = run.code
}
