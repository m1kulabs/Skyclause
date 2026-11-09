import { OpenTelemetry } from '@ai-sdk/otel'
import type { ModelEntry } from '@skyclause/contracts'
import {
  generateText,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  type FinishReason,
  type LanguageModel,
  type LanguageModelUsage,
  type ModelMessage
} from 'ai'
import { estimateInputTokens, INPUT_TOKEN_BUDGET, OUTPUT_TOKEN_BUDGET } from './budget'
import { carriesRoles, DRAFT_MODEL, platformModel, type VertexSettings } from './models'
import { INSTRUCTIONS, repairMessage, serialise } from './prompt'
import { ProposedBundle, type AgentInput } from './schema'
import { issueReasons, validate } from './validate'

/** One model call, kept for the run's trace and its `ai_usage` row (#151) and for #149's token check. */
export interface Attempt {
  provider: string
  model: string
  keyId: string | null
  turn: 'draft' | 'repair'
  /** Everything the call sent: the instructions, then each message in order. */
  prompt: string
  /** The pre-call input estimate, which never undercounts. */
  estimatedInputTokens: number
  usage: LanguageModelUsage
  /** The raw model output, or '' when the provider failed. */
  output: string
  outcome: 'ok' | 'invalid' | 'provider_error'
  /** Validation or schema reasons, or the provider error. */
  reasons: string[]
}

// Spec §1: both outcomes retain the usage, prompt and raw output for the run; `attempts` and `reasons` add the detail.
export type DraftResult = (
  | { ok: true; bundle: ProposedBundle; model: string; provider: string; fallbackUsed: boolean }
  | { ok: false; reason: 'validation' | 'budget' | 'provider_error'; reasons: string[] }
) & { usage: LanguageModelUsage; prompt: string; output: string; attempts: Attempt[] }
export interface DraftOptions {
  chain: ModelEntry[]
  /** #206's factory, `apps/worker` only: entries with a key never resolve here. */
  modelFor: (e: ModelEntry) => Promise<LanguageModel>
  /** Required when the chain holds a `keyId` null entry (the platform's Vertex model). */
  vertex?: VertexSettings
}
export type DraftBundle = (input: AgentInput, o: DraftOptions) => Promise<DraftResult>

const NO_USAGE: LanguageModelUsage = {
  inputTokens: undefined,
  inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined },
  outputTokens: undefined,
  outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
  totalTokens: undefined
}

const plus = (a: number | undefined, b: number | undefined) =>
  a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0)
function totalUsage(attempts: Attempt[]): LanguageModelUsage {
  return attempts.reduce<LanguageModelUsage>(
    (t, { usage: u }) => ({
      inputTokens: plus(t.inputTokens, u.inputTokens),
      inputTokenDetails: {
        noCacheTokens: plus(t.inputTokenDetails.noCacheTokens, u.inputTokenDetails.noCacheTokens),
        cacheReadTokens: plus(t.inputTokenDetails.cacheReadTokens, u.inputTokenDetails.cacheReadTokens),
        cacheWriteTokens: plus(t.inputTokenDetails.cacheWriteTokens, u.inputTokenDetails.cacheWriteTokens)
      },
      outputTokens: plus(t.outputTokens, u.outputTokens),
      outputTokenDetails: {
        textTokens: plus(t.outputTokenDetails.textTokens, u.outputTokenDetails.textTokens),
        reasoningTokens: plus(t.outputTokenDetails.reasoningTokens, u.outputTokenDetails.reasoningTokens)
      },
      totalTokens: plus(t.totalTokens, u.totalTokens)
    }),
    NO_USAGE
  )
}

function schemaReasons(text: string, finishReason: FinishReason | undefined): string[] {
  if (finishReason === 'length') return ['output was cut off at the output token limit; return a shorter object']
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return ['output is not one JSON object']
  }
  const parsed = ProposedBundle.safeParse(json)
  return parsed.success ? ['output did not match the schema'] : issueReasons(parsed.error)
}

/** One structured-output call with no tools: the parsed object, or the schema reasons for the repair turn. */
async function generate(
  model: LanguageModel,
  messages: ModelMessage[],
  maxOutputTokens: number
): Promise<{ text: string; usage: LanguageModelUsage } & ({ output: ProposedBundle } | { reasons: string[] })> {
  try {
    const result = await generateText({
      model,
      instructions: INSTRUCTIONS,
      messages,
      output: Output.object({ schema: ProposedBundle, name: 'ProposedBundle' }),
      maxOutputTokens,
      // Built per call: @ai-sdk/otel pins its own @opentelemetry/api, whose tracer only finds the app's provider if it
      // is looked up after the app registers it. Prompts and outputs are stored with the run, not in spans (TRD).
      telemetry: {
        functionId: 'skyclause.agent.draft',
        recordInputs: false,
        recordOutputs: false,
        integrations: new OpenTelemetry()
      }
    })
    try {
      return { text: result.text, usage: result.totalUsage, output: result.output }
    } catch (error) {
      if (!NoOutputGeneratedError.isInstance(error)) throw error
      return { text: result.text, usage: result.totalUsage, reasons: schemaReasons(result.text, result.finishReason) }
    }
  } catch (error) {
    if (!NoObjectGeneratedError.isInstance(error)) throw error
    const text = error.text ?? ''
    return { text, usage: error.usage ?? NO_USAGE, reasons: schemaReasons(text, error.finishReason) }
  }
}

const errorText = (error: unknown) =>
  (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 500)

/**
 * CAL-3: draft one `ProposedBundle` from a fully assembled input, check it in code, repair once, and route through the
 * chain on provider errors. Budgets are per run: input reported so far plus the next call's estimate, and output.
 */
export const draftBundle: DraftBundle = async (input, { chain, modelFor, vertex }) => {
  if (!vertex && chain.some((e) => e.keyId === null)) {
    throw new TypeError('draftBundle: a keyId null entry needs the vertex project and location')
  }
  const attempts: Attempt[] = []
  const failures: string[] = []
  let prompt = ''
  let spentIn = 0
  let spentOut = 0
  const finish = (r: DistributiveOmit<DraftResult, 'usage' | 'prompt' | 'output' | 'attempts'>): DraftResult => ({
    ...r,
    usage: totalUsage(attempts),
    prompt,
    output: attempts.at(-1)?.output ?? '',
    attempts
  })

  for (const [index, entry] of chain.entries()) {
    const platform = entry.keyId === null
    const route = {
      provider: platform ? DRAFT_MODEL.provider : entry.provider,
      model: platform ? DRAFT_MODEL.model : entry.model,
      keyId: entry.keyId
    }
    const user = serialise(input, { roles: carriesRoles(entry) })
    prompt = `${INSTRUCTIONS}\n\n${user}`
    const messages: ModelMessage[] = [{ role: 'user', content: user }]
    let model: LanguageModel | undefined

    for (const turn of ['draft', 'repair'] as const) {
      const contents = messages.map((m) => (typeof m.content === 'string' ? m.content : ''))
      const sent = [INSTRUCTIONS, ...contents].join('\n\n')
      const estimatedInputTokens = estimateInputTokens({ instructions: INSTRUCTIONS, messages: contents })
      const maxOutputTokens = OUTPUT_TOKEN_BUDGET - spentOut
      if (spentIn + estimatedInputTokens > INPUT_TOKEN_BUDGET) {
        return finish({
          ok: false,
          reason: 'budget',
          reasons: [`input estimate ${spentIn + estimatedInputTokens} tokens is over the run's ${INPUT_TOKEN_BUDGET}`]
        })
      }
      if (maxOutputTokens <= 0) {
        return finish({
          ok: false,
          reason: 'budget',
          reasons: [`output budget of ${OUTPUT_TOKEN_BUDGET} tokens spent`]
        })
      }

      let result: Awaited<ReturnType<typeof generate>>
      try {
        model ??= platform ? platformModel(vertex!) : await modelFor(entry)
        result = await generate(model, messages, maxOutputTokens)
      } catch (error) {
        const reason = `${route.provider} ${route.model}: ${errorText(error)}`
        attempts.push({
          ...route,
          turn,
          prompt: sent,
          estimatedInputTokens,
          usage: NO_USAGE,
          output: '',
          outcome: 'provider_error',
          reasons: [reason]
        })
        failures.push(reason)
        break
      }
      spentIn += result.usage.inputTokens ?? estimatedInputTokens
      spentOut += result.usage.outputTokens ?? maxOutputTokens

      const checked =
        'output' in result ? validate(result.output, input) : { ok: false as const, reasons: result.reasons }
      attempts.push({
        ...route,
        turn,
        prompt: sent,
        estimatedInputTokens,
        usage: result.usage,
        output: result.text,
        outcome: checked.ok ? 'ok' : 'invalid',
        reasons: checked.ok ? [] : checked.reasons
      })
      if (checked.ok) {
        return finish({
          ok: true,
          bundle: checked.bundle,
          provider: route.provider,
          model: route.model,
          fallbackUsed: index > 0
        })
      }
      if (turn === 'repair') return finish({ ok: false, reason: 'validation', reasons: checked.reasons })
      messages.push(
        { role: 'assistant', content: result.text },
        { role: 'user', content: repairMessage(checked.reasons) }
      )
    }
  }
  return finish({ ok: false, reason: 'provider_error', reasons: failures })
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
