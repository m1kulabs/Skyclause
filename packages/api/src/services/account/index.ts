import { readAccountPreferences, writeAccountPreferences, writeMagicLinkEnabled } from '@skyclause/db'
import type { Preferences as PreferenceValues } from '@skyclause/contracts'

/** Reads the signed-in account's real preferences, adding defaults for fields not yet stored. */
export const getAccountPreferences = readAccountPreferences

/** Saves a partial preference update and returns the complete account preference shape. */
export const updateAccountPreferences = (accountId: string, update: Partial<PreferenceValues>) =>
  writeAccountPreferences(accountId, update)

/** Changes the account's magic-link sign-in flag; the API performs the shared method guard first. */
export const updateMagicLinkEnabled = writeMagicLinkEnabled
