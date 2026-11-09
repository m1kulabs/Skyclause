import { z } from '@hono/zod-openapi'
import { Instant } from '../../shared'

// TRD pilot_archive: files stay outside the platform ledger (LED-8).
export const PilotArchive = z.object({
  project_id: z.string(),
  kind: z.enum(['sheets_ledger', 'jira_register', 'run_traces']),
  url: z.url(),
  sha256: z.string(),
  captured_at: Instant
})
