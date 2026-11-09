import { bundles } from './bundles'
import { email } from './email'
import { domainEvents } from './events'
import { migrations } from './migrate'
import { pilotArchive } from './pilot-archive'
import { restoreDrill } from './restore-drill'
import { defineRegistry } from './server'

// Spec §7: each owner appends one line here, naming a `WorkerPart` exported from its own folder,
// for example `evaluator, // b-evaluator`.
export const registry = defineRegistry([
  restoreDrill, // a-ops-runbooks
  email, // a-email-transport
  migrations, // f-db
  domainEvents, // f-db-schema
  pilotArchive, // c-ledger-chain
  bundles // c-bundle-lifecycle
])
