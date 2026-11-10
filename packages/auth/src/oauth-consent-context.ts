import { AsyncLocalStorage } from 'node:async_hooks'

/** Only the shared consent service sets this, for its own in-process provider request. */
export const oauthConsentReference = new AsyncLocalStorage<string>()
