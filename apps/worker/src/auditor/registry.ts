import type { RegisterAuditCheck } from '@skyclause/contracts'

export type AuditCheck = Parameters<RegisterAuditCheck>[0]

/** Isolated registration state, also used by the production singleton. */
export function createAuditRegistry(): { register: RegisterAuditCheck; checks(): readonly AuditCheck[] } {
  const registered = new Map<string, AuditCheck>()
  return {
    register(check) {
      if (registered.has(check.name)) throw new Error(`duplicate audit check: ${check.name}`)
      registered.set(check.name, Object.freeze({ ...check }))
    },
    checks: () => Object.freeze([...registered.values()])
  }
}

const registry = createAuditRegistry()
export const registerAuditCheck: RegisterAuditCheck = registry.register
export const auditChecks = registry.checks
