import { email } from './email'
import { restoreDrill } from './restore-drill'
import { defineRegistry } from './server'

// Spec §7: each owner appends one line here, naming a `WorkerPart` exported from its own folder,
// for example `evaluator, // b-evaluator`.
export const registry = defineRegistry([
  restoreDrill, // a-ops-runbooks
  email // a-email-transport
])
