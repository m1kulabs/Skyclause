import { auditor } from './auditor'
import { alerts } from './alerts'
import { aiKeys } from './ai-keys'
import { analysis } from './analysis'
import { bundles } from './bundles'
import { email } from './email'
import { evidence } from './evidence'
import { domainEvents } from './events'
import { dataRights } from './data-rights'
import { grades } from './grades'
import { ics } from './ics'
import { migrations } from './migrate'
import { notices } from './notices'
import { notifications } from './notifications'
import { pilotArchive } from './pilot-archive'
import { replies } from './replies'
import { restoreDrill } from './restore-drill'
import { runs } from './runs'
import { retention } from './retention'
import { defineRegistry } from './server'
import { sources } from './sources'

// Spec §7: each owner appends one line here, naming a `WorkerPart` exported from its own folder,
// for example `evaluator, // b-evaluator`.
export const registry = defineRegistry([
  restoreDrill, // a-ops-runbooks
  email, // a-email-transport
  migrations, // f-db
  domainEvents, // f-db-schema
  pilotArchive, // c-ledger-chain
  aiKeys, // e-byok-api
  bundles, // c-bundle-lifecycle
  evidence, // c-evidence
  grades, // c-grades
  replies, // c-recipient-replies
  runs, // c-run-orchestrator
  notices, // c-sender-email
  alerts, // c-approver-alerts
  notifications, // c-notifications
  ics, // c-ics-feed
  analysis, // c-analysis-api
  auditor, // b-auditor
  sources, // b-sources-core
  dataRights, // a-data-rights
  retention // a-retention
])
