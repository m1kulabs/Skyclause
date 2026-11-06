import { notBuilt, type ModelEntry } from '@skyclause/contracts'
import type { LanguageModel, LanguageModelUsage } from 'ai'
import type { AgentInput, ProposedBundle } from '../schema'

// Spec §1: both outcomes retain the usage, prompt and raw output for the run.
export type DraftResult = (
  | { ok: true; bundle: ProposedBundle; model: string; provider: string; fallbackUsed: boolean }
  | { ok: false; reason: 'validation' | 'budget' | 'provider_error' }
) & { usage: LanguageModelUsage; prompt: string; output: string }
export type DraftBundle = (
  input: AgentInput,
  o: { chain: ModelEntry[]; modelFor: (e: ModelEntry) => Promise<LanguageModel> }
) => Promise<DraftResult>

export const draftBundle: DraftBundle = notBuilt('c-agent-core')
