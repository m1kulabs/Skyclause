import { createApi } from './app'
import { productionDeps } from './production'

/** The mounted apps: `apps/web`'s Route Handlers serve them, and MCP calls `v1.fetch(req, { principal })` (D5). */
export const { v1, api } = createApi(productionDeps)

export { createApi, type ApiApp, type Registry } from './app'
export type { ApiConfig, ApiDeps, ApiEnv, Surface } from './context'
export { APP_CORS_HEADERS, appCors, EXPOSED_HEADERS, publicCors, withPublicCors } from './cors'
export {
  requireHumanSession,
  requirePermission,
  requirePrincipal,
  requireRecentAuth,
  requireRole,
  requireScope,
  requireStaff,
  setPermissionCheck,
  setPrincipalResolver
} from './middleware/auth'
export { requireIdempotency } from './middleware/idempotency'
export { requireOrg } from './middleware/org'
export { rateLimit } from './middleware/rate-limit'
export { deprecate } from './deprecation'
export { health } from './health'
export { checkOpenApi, openApiDocument, openApiResponse, serializeOpenApi, type OpenApiDocument } from './openapi'
export { decodeCursor, encodeCursor, page } from './pagination'
export { ApiError, problemType } from './problems'
export type { AnyHandlerEntry, HandlerEntry, Handlers } from './routes'
export { instant, toWire } from './serialize'
// c-bundle-lifecycle (#150): the reads `/v1` serves, for server components (#79 conventions).
export {
  getBundle,
  getCall,
  getCallExplanation,
  listProjectBundles,
  listProjectCalls,
  type BundleDetail,
  type BundleView,
  type CallDetail,
  type CallExplanation,
  type CallView
} from './services/bundles'
export {
  archiveProject,
  createProject,
  getProject,
  listProjects,
  restoreProject,
  updateProject,
  type CreateProjectInput,
  type ProjectSettingsView,
  type ProjectWithSummaryView,
  type UpdateProjectInput
} from './services/projects'
export { createRun, getRun, listRuns, type RunView } from './services/runs'
export { sseResponse, type SseMessage, type SseOptions } from './sse'
export { inspectMemberToken } from './services/members'
export { createRotaService, nextApprovers, onDuty, ROTA_TEMPLATES, ROTA_TIME_ZONE } from './services/rota'
export type * from './stores'
export { calendarFeed, serveCalendarFeed, type CalendarFeed, type CalendarFeedDeps } from './services/ics'
export { inTenant, type ServiceContext, type WithTenant } from './tenancy'
export { unbuiltOperations } from './unbuilt'
export * from './placeholders/b-auditor'
