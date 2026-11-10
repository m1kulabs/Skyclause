import type { ApiKeyManager } from '@skyclause/contracts'

// #79 §1 keeps packages/api independent of packages/auth; apps/web registers the Better Auth implementation.
let registered: ApiKeyManager | undefined

export function setApiKeyManager(manager: ApiKeyManager): void {
  registered = manager
}

function manager(): ApiKeyManager {
  if (!registered) throw new Error('The web composition root did not register the API-key manager')
  return registered
}

export const registeredApiKeyManager: ApiKeyManager = {
  create: (input) => manager().create(input),
  list: (query) => manager().list(query),
  find: (query) => manager().find(query),
  revoke: (query) => manager().revoke(query)
}
