import { createApiFetch, type ApiFetchOptions } from '../../lib/api-fetch'
import { ledgerOperations } from './operations'

/** Validate large ledger pages without blocking the next filter interaction. */
export async function readLedgerPage(options: ApiFetchOptions<typeof ledgerOperations.listLedgerEntries>) {
  const operation = ledgerOperations.listLedgerEntries
  const fetchPage = createApiFetch({
    listLedgerEntries: {
      ...operation,
      response: {
        async parse(value: unknown) {
          const schema = operation.response
          if (!value || typeof value !== 'object' || !('data' in value) || !Array.isArray(value.data))
            return schema.parse(value)

          const page = schema.parse({ ...value, data: [] })
          for (let index = 0; index < value.data.length; index += 100) {
            if (index) await new Promise<void>((resolve) => setTimeout(resolve, 0))
            options.signal?.throwIfAborted()
            page.data.push(...schema.shape.data.parse(value.data.slice(index, index + 100)))
          }
          return page
        }
      }
    }
  })
  return await fetchPage('listLedgerEntries', { ...options })
}
