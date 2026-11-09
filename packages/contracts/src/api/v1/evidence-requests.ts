import { createEvidenceRequest } from './evidence-requests/createEvidenceRequest'
import { getEvidenceRequest } from './evidence-requests/getEvidenceRequest'
import { listEvidenceRequests } from './evidence-requests/listEvidenceRequests'

export { createEvidenceRequest } from './evidence-requests/createEvidenceRequest'
export { getEvidenceRequest } from './evidence-requests/getEvidenceRequest'
export { listEvidenceRequests } from './evidence-requests/listEvidenceRequests'

export const routes = [listEvidenceRequests, createEvidenceRequest, getEvidenceRequest] as const
