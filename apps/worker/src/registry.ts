import { defineRegistry } from './server'
import { email } from './email'

// Spec §7: each owner appends one line here, naming a `WorkerPart` exported from its own folder,
// for example `evaluator, // b-evaluator`.
export const registry = defineRegistry([
  email // a-email-transport
])
