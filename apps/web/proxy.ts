import type { NextRequest } from 'next/server'
import { hostConfig, proxyResponse, type HostConfig } from './lib/hosts'

let hosts: HostConfig | undefined

// Spec §4 Hosts. Reads HOST_MODE and the six origins, which `loadEnv('web')` checked as the server started.
export function proxy(request: NextRequest) {
  hosts ??= hostConfig(process.env)
  return proxyResponse(request, hosts)
}
