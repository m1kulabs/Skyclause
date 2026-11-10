import {
  canonicalHash,
  check,
  SOURCE_KINDS,
  type CheckResult,
  type IndicatorRegistry,
  type Instant,
  type ReadingHistory,
  type SheetInput,
  type Window
} from '@skyclause/clauses'
import { NotBuiltError, type Pack, type SnapshotSource, type TxHandle } from '@skyclause/contracts'
import type { SavedValidation } from '@skyclause/db'
import { z } from 'zod'
import { ApiError } from '../../problems'

export interface RuntimeIndicatorRegistry {
  load(tx: TxHandle, q: { projectId: string; pack: Pack; registryHash?: string }): Promise<IndicatorRegistry>
}
export interface ClauseSheetPorts {
  registry: RuntimeIndicatorRegistry | null
  snapshots: SnapshotSource | null
  recordedAt:
    | null
    | ((
        tx: TxHandle,
        q: { projectId: string; pack: Pack; tEval: Instant }
      ) => Promise<{ history: ReadingHistory; windows: Window[] }>)
}
let ports: ClauseSheetPorts = { registry: null, snapshots: null, recordedAt: null }
export function setClauseSheetPorts(parts: ClauseSheetPorts): void {
  ports = { ...parts }
}
export function clauseSheetPorts(): ClauseSheetPorts {
  return ports
}
export const unavailable = () =>
  new ApiError(501, 'not-built', 'An authoritative clause evaluation dependency is unavailable.', {
    owner: 'b-evaluator'
  })
export const notPublishable = (detail: string) => new ApiError(422, 'not-publishable', detail)
/** The engine owns its own NotBuiltError class; map both forms without turning a provider gap into a 500. */
export async function dependency<T>(read: () => T | Promise<T>): Promise<T> {
  try {
    return await read()
  } catch (error) {
    if (
      error instanceof NotBuiltError ||
      (error instanceof Error && error.name === 'NotBuiltError' && 'owner' in error)
    )
      throw unavailable()
    throw error
  }
}
const definition = z
  .object({
    name: z.string().min(1),
    celType: z.enum(['double', 'int', 'bool', 'timestamp', 'duration', 'list']),
    unit: z.string(),
    scope: z.enum(['site', 'window']),
    sourceKind: z.enum(SOURCE_KINDS)
  })
  .strict()
export async function loadRegistry(
  tx: TxHandle,
  q: { projectId: string; pack: Pack; registryHash?: string }
): Promise<IndicatorRegistry> {
  const provider = ports.registry
  if (!provider) throw unavailable()
  const registry = z
    .array(definition)
    .min(1)
    .safeParse(await dependency(() => provider.load(tx, q)))
  if (!registry.success) throw unavailable()
  const definitions = new Map<string, string>()
  for (const item of registry.data) {
    const hash = canonicalHash(item)
    const prior = definitions.get(item.name)
    if (prior && prior !== hash) throw notPublishable(`Conflicting registered indicator definition: ${item.name}`)
    definitions.set(item.name, hash)
  }
  if (q.registryHash !== undefined && canonicalHash(registry.data) !== q.registryHash)
    throw notPublishable('The registered historical indicator definitions do not match the recorded registry hash.')
  return registry.data
}
export async function checkedValidation(
  content: SheetInput,
  registry: IndicatorRegistry
): Promise<{ result: CheckResult; validation: SavedValidation }> {
  const result = await dependency(() => check(content, registry))
  return {
    result,
    validation: {
      check: { ok: result.ok, publishable: result.publishable, issues: result.issues },
      checked: result.sheet ?? null,
      registryHash: canonicalHash(registry)
    }
  }
}
export function requireChecked(result: CheckResult) {
  if (!result.ok || !result.publishable || !result.sheet)
    throw new ApiError(422, 'not-publishable', 'The clause sheet is not publishable.', {
      issues: result.issues.map((i) => ({
        clause_key: i.clauseKey,
        message: i.message,
        offset: i.offset,
        length: i.length
      }))
    })
  return result.sheet
}
