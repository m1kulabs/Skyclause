import type { TriggerEntry } from './triggers.ts'

// Every trigger `setup()` installs on the pilot. Feature tickets add one line each; each handler must also be
// exported from main.ts so the build makes it a top-level function.
export const triggerRegistry: TriggerEntry[] = []
