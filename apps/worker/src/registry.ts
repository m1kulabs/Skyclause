import { defineRegistry } from './server'
import { sesInbound } from './ses-inbound'

// Spec §7: each owner appends one line here, naming a `WorkerPart` exported from its own folder,
// for example `evaluator, // b-evaluator`.
export const registry = defineRegistry([
  sesInbound // a-email-transport
])
