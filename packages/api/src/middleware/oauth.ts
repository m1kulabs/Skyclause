import { NotBuiltError } from '@skyclause/contracts'
import type { OAuthManagement } from '../context'

// f-auth registers the implementation at apps/web's composition root; packages/api never imports packages/auth.
let registered: OAuthManagement | undefined

export function setOAuthManagement(service: OAuthManagement) {
  registered = service
}

function service() {
  if (!registered) throw new NotBuiltError('e-mcp-auth')
  return registered
}

export const registeredOAuthManagement: OAuthManagement = {
  listClients: (...args) => service().listClients(...args),
  createClient: (...args) => service().createClient(...args),
  deleteClient: (...args) => service().deleteClient(...args),
  listGrants: (...args) => service().listGrants(...args),
  revokeGrant: (...args) => service().revokeGrant(...args)
}
