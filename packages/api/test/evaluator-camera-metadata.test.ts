import { expect, test } from 'vitest'
import { type SheetInput } from '@skyclause/clauses'
import skyDefault from '@skyclause/clauses/defaults/sky.json'
import type { TxHandle } from '@skyclause/contracts'
import { createEvaluatorProviders, productionEvaluatorProviders } from '@skyclause/api/evaluator'
import { TEST_REGISTRY } from '../../clauses/test/test-helpers'
import { checkedValidation } from '../src/services/clause-sheets/ports'

const tx = {} as TxHandle
const query = { projectId: 'camera-metadata-check', pack: 'sky' as const }

test('production camera declarations let the real default Sky checker use the installed engine reducer', async () => {
  const installed = await productionEvaluatorProviders().registry.load(tx, query)
  // #122/#123 declarations are isolated here until their actual adapters land.
  // Camera must come from production, never this test supplement.
  const supplement = TEST_REGISTRY.filter((d) => ['met_warning', 'met_forecast', 'apims'].includes(d.sourceKind))
  const providers = createEvaluatorProviders({
    adapters: [{ indicators: installed }, { indicators: supplement }],
    forecast: null
  })
  const registry = await providers.registry.load(tx, query)
  const { result } = await checkedValidation(skyDefault as SheetInput, registry)
  expect(result.publishable, JSON.stringify(result.issues)).toBe(true)
  expect(result.sheet?.registryTypes?.['site.camera_far_low_frames']).toBe('int')
  expect(registry.find((d) => d.name === 'site.camera_far_low_frames')).toEqual({
    name: 'site.camera_far_low_frames',
    celType: 'int',
    unit: 'frames',
    scope: 'site',
    sourceKind: 'camera'
  })
})

test('an explicitly empty provider set remains unavailable', async () => {
  const providers = createEvaluatorProviders({ adapters: [], forecast: null })
  await expect(providers.registry.load(tx, query)).rejects.toMatchObject({
    name: 'NotBuiltError',
    owner: 'b-evaluator:indicator-registry'
  })
})
