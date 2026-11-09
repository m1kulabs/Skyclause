import { listMyMemberships } from './me/listMyMemberships'
import { getMyPreferences } from './me/getMyPreferences'
import { updateMyPreferences } from './me/updateMyPreferences'
import { updateMySecurity } from './me/updateMySecurity'
import { listMyApiKeys } from './me/listMyApiKeys'
import { createMyApiKey } from './me/createMyApiKey'
import { revokeMyApiKey } from './me/revokeMyApiKey'
import { listMyAiKeys } from './me/listMyAiKeys'
import { createMyAiKey } from './me/createMyAiKey'
import { deleteMyAiKey } from './me/deleteMyAiKey'
import { testMyAiKey } from './me/testMyAiKey'
import { getMyAiKeyUsage } from './me/getMyAiKeyUsage'
import { listMyExports } from './me/listMyExports'
import { createMyExport } from './me/createMyExport'
import { deleteMyAccount } from './me/deleteMyAccount'
import { getMyNotificationPreferences } from './me/getMyNotificationPreferences'
import { updateMyNotificationPreferences } from './me/updateMyNotificationPreferences'

export { listMyMemberships } from './me/listMyMemberships'
export { getMyPreferences } from './me/getMyPreferences'
export { updateMyPreferences } from './me/updateMyPreferences'
export { updateMySecurity } from './me/updateMySecurity'
export { listMyApiKeys } from './me/listMyApiKeys'
export { createMyApiKey } from './me/createMyApiKey'
export { revokeMyApiKey } from './me/revokeMyApiKey'
export { listMyAiKeys } from './me/listMyAiKeys'
export { createMyAiKey } from './me/createMyAiKey'
export { deleteMyAiKey } from './me/deleteMyAiKey'
export { testMyAiKey } from './me/testMyAiKey'
export { getMyAiKeyUsage } from './me/getMyAiKeyUsage'
export { listMyExports } from './me/listMyExports'
export { createMyExport } from './me/createMyExport'
export { deleteMyAccount } from './me/deleteMyAccount'
export { getMyNotificationPreferences } from './me/getMyNotificationPreferences'
export { updateMyNotificationPreferences } from './me/updateMyNotificationPreferences'

export const routes = [
  listMyMemberships,
  getMyPreferences,
  updateMyPreferences,
  updateMySecurity,
  listMyApiKeys,
  createMyApiKey,
  revokeMyApiKey,
  listMyAiKeys,
  createMyAiKey,
  deleteMyAiKey,
  testMyAiKey,
  getMyAiKeyUsage,
  listMyExports,
  createMyExport,
  deleteMyAccount,
  getMyNotificationPreferences,
  updateMyNotificationPreferences
] as const
