import { unbuiltOperations } from '@skyclause/api'

/**
 * Whether the Devices part can work: `createDevice` has a handler. Read on the server from the API's handler table, so
 * Add device comes back on its own once the handler lands, and is never offered while it can only fail.
 */
export function devicesBuilt(): boolean {
  return !unbuiltOperations().some((operation) => operation.operationId === 'createDevice')
}
