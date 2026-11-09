import { listProjectCalls } from './calls/listProjectCalls'
import { getCall } from './calls/getCall'
import { getCallExplanation } from './calls/getCallExplanation'

export { listProjectCalls } from './calls/listProjectCalls'
export { getCall } from './calls/getCall'
export { getCallExplanation } from './calls/getCallExplanation'

export const routes = [listProjectCalls, getCall, getCallExplanation] as const
