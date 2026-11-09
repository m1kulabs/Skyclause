import type { NextRequest } from 'next/server'
import { securityHeaders } from './features/hardening/security-headers'

// Spec §4 Hosts. Reads HOST_MODE and the six origins, which `loadEnv('web')` checked as the server started.
export function proxy(request: NextRequest) {
  return securityHeaders(request)
}
