import { REGISTRY } from '@skyclause/contracts'
import { HANDLERS, type Handlers } from './routes'

/** Every registry operation without a handler, which answers 501 `not-built`; `check:unbuilt` lists these. */
export function unbuiltOperations(handlers: Partial<Record<string, unknown>> | Handlers = HANDLERS) {
  return REGISTRY.filter((route) => !(route.operationId in handlers)).map((route) => ({
    owner: route['x-skyclause'].owner,
    operationId: route.operationId as string,
    method: route.method.toUpperCase(),
    path: route.path as string
  }))
}
