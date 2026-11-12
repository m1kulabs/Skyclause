import { createMetForecastAdapter, type SourceAdapter } from '@skyclause/sources'
import { createPollContext } from './http'
import { adapterStorage } from './storage'
import type { SourceJobPorts } from './jobs'

/** Bind MET discovery at the composition root to the same captured transport used by polls and probes. */
export function configureMetDiscovery(
  adapters: readonly SourceAdapter<unknown>[],
  ports: Pick<SourceJobPorts, 'store' | 'scratch' | 'clock' | 'id' | 'http' | 'userAgent' | 'log'>
): readonly SourceAdapter<unknown>[] {
  return adapters.map((adapter) => {
    if (adapter.kind !== 'met_forecast') return adapter
    return {
      ...adapter,
      async discover() {
        const captured = createPollContext({
          kind: adapter.kind,
          family: 'datagovmy-weather',
          sources: [],
          storage: adapterStorage(adapter.kind, ports.store, ports.scratch),
          budget: ports.store,
          http: ports.http,
          userAgent: ports.userAgent,
          periods: async () => [],
          log: ports.log,
          clock: ports.clock,
          requestId: ports.id
        })
        try {
          return await createMetForecastAdapter({ discoveryHttp: captured.ctx.http }).discover!()
        } catch (error) {
          ports.log('source.discovery.failed', { adapter: adapter.kind, error: String(error) })
          throw error
        } finally {
          await captured.closeAndDrain()
          for (const { body, ...request } of captured.requests)
            ports.log('source.discovery.request', {
              adapter: adapter.kind,
              ...request,
              bodyBytes: body?.byteLength ?? null
            })
        }
      }
    }
  })
}
