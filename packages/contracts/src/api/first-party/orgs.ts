import { createOrganisation } from './orgs/createOrganisation'
import { updateOrganisation } from './orgs/updateOrganisation'
import { listMembers } from './orgs/listMembers'
import { updateMember } from './orgs/updateMember'
import { removeMember } from './orgs/removeMember'
import { listInvitations } from './orgs/listInvitations'
import { createInvitation } from './orgs/createInvitation'
import { revokeInvitation } from './orgs/revokeInvitation'
import { resendInvitation } from './orgs/resendInvitation'
import { createOwnershipTransfer } from './orgs/createOwnershipTransfer'
import { getRota } from './orgs/getRota'
import { updateRota } from './orgs/updateRota'
import { createRotaShift } from './orgs/createRotaShift'
import { updateRotaShift } from './orgs/updateRotaShift'
import { deleteRotaShift } from './orgs/deleteRotaShift'
import { listAuditEntries } from './orgs/listAuditEntries'
import { exportAuditLog } from './orgs/exportAuditLog'
import { listOrganisationApiKeys } from './orgs/listOrganisationApiKeys'
import { createOrganisationApiKey } from './orgs/createOrganisationApiKey'
import { revokeOrganisationApiKey } from './orgs/revokeOrganisationApiKey'
import { listOrganisationAiKeys } from './orgs/listOrganisationAiKeys'
import { createOrganisationAiKey } from './orgs/createOrganisationAiKey'
import { deleteOrganisationAiKey } from './orgs/deleteOrganisationAiKey'
import { testOrganisationAiKey } from './orgs/testOrganisationAiKey'
import { getOrganisationAiKeyUsage } from './orgs/getOrganisationAiKeyUsage'
import { getOrganisationAiSettings } from './orgs/getOrganisationAiSettings'
import { updateOrganisationAiSettings } from './orgs/updateOrganisationAiSettings'
import { listOrganisationExports } from './orgs/listOrganisationExports'
import { createOrganisationExport } from './orgs/createOrganisationExport'
import { getOrganisationDeletion } from './orgs/getOrganisationDeletion'
import { requestOrganisationDeletion } from './orgs/requestOrganisationDeletion'
import { cancelOrganisationDeletion } from './orgs/cancelOrganisationDeletion'
import { getOnboarding } from './orgs/getOnboarding'
import { skipOnboardingStep } from './orgs/skipOnboardingStep'
import { createProject } from './orgs/createProject'
import { listOauthClients } from './orgs/listOauthClients'
import { createOauthClient } from './orgs/createOauthClient'
import { deleteOauthClient } from './orgs/deleteOauthClient'
import { listOauthGrants } from './orgs/listOauthGrants'
import { revokeOauthGrant } from './orgs/revokeOauthGrant'

export { createOrganisation } from './orgs/createOrganisation'
export { updateOrganisation } from './orgs/updateOrganisation'
export { listMembers } from './orgs/listMembers'
export { updateMember } from './orgs/updateMember'
export { removeMember } from './orgs/removeMember'
export { listInvitations } from './orgs/listInvitations'
export { createInvitation } from './orgs/createInvitation'
export { revokeInvitation } from './orgs/revokeInvitation'
export { resendInvitation } from './orgs/resendInvitation'
export { createOwnershipTransfer } from './orgs/createOwnershipTransfer'
export { getRota } from './orgs/getRota'
export { updateRota } from './orgs/updateRota'
export { createRotaShift } from './orgs/createRotaShift'
export { updateRotaShift } from './orgs/updateRotaShift'
export { deleteRotaShift } from './orgs/deleteRotaShift'
export { listAuditEntries } from './orgs/listAuditEntries'
export { exportAuditLog } from './orgs/exportAuditLog'
export { listOrganisationApiKeys } from './orgs/listOrganisationApiKeys'
export { createOrganisationApiKey } from './orgs/createOrganisationApiKey'
export { revokeOrganisationApiKey } from './orgs/revokeOrganisationApiKey'
export { listOrganisationAiKeys } from './orgs/listOrganisationAiKeys'
export { createOrganisationAiKey } from './orgs/createOrganisationAiKey'
export { deleteOrganisationAiKey } from './orgs/deleteOrganisationAiKey'
export { testOrganisationAiKey } from './orgs/testOrganisationAiKey'
export { getOrganisationAiKeyUsage } from './orgs/getOrganisationAiKeyUsage'
export { getOrganisationAiSettings } from './orgs/getOrganisationAiSettings'
export { updateOrganisationAiSettings } from './orgs/updateOrganisationAiSettings'
export { listOrganisationExports } from './orgs/listOrganisationExports'
export { createOrganisationExport } from './orgs/createOrganisationExport'
export { getOrganisationDeletion } from './orgs/getOrganisationDeletion'
export { requestOrganisationDeletion } from './orgs/requestOrganisationDeletion'
export { cancelOrganisationDeletion } from './orgs/cancelOrganisationDeletion'
export { getOnboarding } from './orgs/getOnboarding'
export { skipOnboardingStep } from './orgs/skipOnboardingStep'
export { createProject } from './orgs/createProject'
export { listOauthClients } from './orgs/listOauthClients'
export { createOauthClient } from './orgs/createOauthClient'
export { deleteOauthClient } from './orgs/deleteOauthClient'
export { listOauthGrants } from './orgs/listOauthGrants'
export { revokeOauthGrant } from './orgs/revokeOauthGrant'

export const routes = [
  createOrganisation,
  updateOrganisation,
  listMembers,
  updateMember,
  removeMember,
  listInvitations,
  createInvitation,
  revokeInvitation,
  resendInvitation,
  createOwnershipTransfer,
  getRota,
  updateRota,
  createRotaShift,
  updateRotaShift,
  deleteRotaShift,
  listAuditEntries,
  exportAuditLog,
  listOrganisationApiKeys,
  createOrganisationApiKey,
  revokeOrganisationApiKey,
  listOrganisationAiKeys,
  createOrganisationAiKey,
  deleteOrganisationAiKey,
  testOrganisationAiKey,
  getOrganisationAiKeyUsage,
  getOrganisationAiSettings,
  updateOrganisationAiSettings,
  listOrganisationExports,
  createOrganisationExport,
  getOrganisationDeletion,
  requestOrganisationDeletion,
  cancelOrganisationDeletion,
  getOnboarding,
  skipOnboardingStep,
  createProject,
  listOauthClients,
  createOauthClient,
  deleteOauthClient,
  listOauthGrants,
  revokeOauthGrant
] as const
