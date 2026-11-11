// #151 test doubles for the run orchestrator's ports (#79 §1): SnapshotSource and ShadowEvaluator (#133),
// ModelResolver and modelFor (#206), BudgetGate (#181), and the AI SDK's own mock model, scripted per call. No test
// calls a live model: every chain entry carries a key, which only the `modelFor` double resolves.
import { canonicalHash, type CheckedSheet, type IndicatorSnapshot, type Verdicts } from '@skyclause/clauses'
import type { BudgetGate, ModelEntry, SnapshotSource } from '@skyclause/contracts'
import type { Tx } from '@skyclause/db'
import { defaultSheet } from '@skyclause/db/test/bundles/scene'
import { saveEvaluatorSnapshot } from '@skyclause/db'
import { TEST_REGISTRY } from '../../../../packages/clauses/test/test-helpers'
import { DESIGN_BODY, stormSnapshot, stormVerdicts, type RunScene } from '@skyclause/db/test/runs/scene'
import { MockLanguageModelV4 } from 'ai/test'
import type { RunPorts } from '../../src/runs'

type Reply = string | Error

/** Plays `replies` in order, repeating the last; an `Error` is a provider failure. Usage: 1200 in, 300 out. */
export function scripted(replies: Reply[]) {
  let call = 0
  return new MockLanguageModelV4({
    provider: 'mock',
    modelId: 'mock-model',
    doGenerate: async () => {
      const reply = replies[Math.min(call++, replies.length - 1)]!
      if (reply instanceof Error) throw reply
      return {
        content: [{ type: 'text', text: reply }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: { total: 1200, noCache: 1200, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 300, text: 300, reasoning: undefined }
        },
        warnings: []
      }
    }
  })
}

/** The text of every message the model received on call `n`. */
export function promptOf(model: MockLanguageModelV4, n = 0): string {
  return model.doGenerateCalls[n]!.prompt.map((message) =>
    typeof message.content === 'string'
      ? message.content
      : message.content.map((part) => ('text' in part ? part.text : '')).join('')
  ).join('\n')
}

/** The DESIGN wording as the model's structured output, for `windowId` and its candidates. */
export function stormReply(windowId: string, recipients: string[], mode = 'commute_disruption') {
  return JSON.stringify({
    pack: 'sky',
    calls: [
      {
        window_id: windowId,
        mode,
        watch: false,
        no_call: null,
        fired: mode === 'normal' ? [] : [{ clause: 'storm_confirmed', inputs: ['w.rain_max_60m_mm'] }],
        recommendations: [],
        recipients,
        notices: [{ language: 'en', subject: 'Commute disruption for the 15:30 release wave', body: DESIGN_BODY }],
        reason: 'Storm confirmed: the 60-minute total reached the Lebat class at the 15:00 reading.'
      }
    ],
    items: []
  })
}

export interface Doubles {
  ports: RunPorts
  model: MockLanguageModelV4
  /** Every `BudgetGate.consume` call's principal kind and kind. */
  consumed: string[]
  /** Every `ModelResolver.chain` query. */
  chains: Array<{ orgId: string; accountId: string | null; unattended: boolean }>
}

/**
 * Ports for `scene`: the snapshot persists as a real `indicator_snapshot` row, the sheet is the scene's published
 * version 1, the chain is one keyed entry (`keyId`, an `ai_key` row's ID), and the model plays `replies`.
 */
export function doubles(
  scene: RunScene,
  o: {
    keyId: string
    replies: Reply[]
    snapshot?: (projectId: string) => IndicatorSnapshot
    verdicts?: (windowIds: string[]) => Verdicts
    budget?: Awaited<ReturnType<BudgetGate['consume']>>
    now?: () => Date
  }
): Doubles {
  const model = scripted(o.replies)
  const consumed: string[] = []
  const chains: Doubles['chains'] = []
  const entry: ModelEntry = { provider: 'google', model: 'gemini-3.8-flash', keyId: o.keyId, declaredTier: 'paid' }
  const snapshots: SnapshotSource = {
    take: async (handle, q) => {
      const candidate = (o.snapshot ?? stormSnapshot)(q.projectId)
      const registry = [...TEST_REGISTRY].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      const { hash: _hash, ...original } = candidate
      const body = { ...original, tEval: q.tEval, registryHash: canonicalHash(registry) }
      const snapshot = { ...body, hash: canonicalHash(body) }
      if (!q.persist) return { snapshotId: null, snapshot }
      return saveEvaluatorSnapshot(handle as Tx, { snapshot, registry, windows: q.windows })
    }
  }
  const ports: RunPorts = {
    snapshots,
    shadow: {
      loadPublished: async () => ({
        versionId: scene.sheetVersionId,
        n: 1,
        sheet: { ...(defaultSheet('sky') as object), contentHash: 'content', registryHash: 'registry' } as CheckedSheet
      }),
      evaluate: (_sheet, _snapshot, windows) => {
        const verdicts = (o.verdicts ?? ((ids) => stormVerdicts(ids[0]!)))(windows.map((w) => w.id))
        return { verdicts, verdictHash: verdicts.hash, explanations: [] }
      }
    },
    budget: {
      consume: async (_tx, p, kind) => {
        consumed.push(`${p.kind}:${kind}`)
        return o.budget ?? { ok: true }
      }
    },
    models: {
      chain: async (_tx, q) => {
        chains.push(q)
        return [entry]
      }
    },
    modelFor: async () => model,
    origins: ['https://skyclause.m1ku.tech', 'https://app.skyclause.m1ku.tech'],
    now: o.now ?? (() => new Date('2026-11-02T07:05:30Z'))
  }
  return { ports, model, consumed, chains }
}
