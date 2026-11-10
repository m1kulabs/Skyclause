import type { RouteConfig, RouteHandler } from '@hono/zod-openapi'
import type { OperationId, Operations } from '@skyclause/contracts'
import type { Context, MiddlewareHandler } from 'hono'
import type { ApiEnv } from '../context'
import { approvalHandlers } from './approvals'
import { aiKeyHandlers } from './ai-keys'
import { alertHandlers } from './alerts'
import { auditHandlers } from './audit'
import { analysisHandlers } from './analysis'
import { bundleHandlers } from './bundles'
import { channelHandlers } from './channels'
import { evidenceHandlers } from './evidence'
import { gradesHandlers } from './grades'
import { ledgerHandlers } from './ledger'
import { notificationHandlers } from './notifications'
import { oauthHandlers } from './oauth'
import { onboardingHandlers } from './onboarding'
import { projectHandlers } from './projects'
import { replyHandlers } from './replies'
import { runHandlers } from './runs'
import { memberHandlers } from './members'
import { rotaHandlers } from './rota'
import { subscriberHandlers } from './subscribers'
import { subscriberRightsHandlers } from './subscriber-rights'
import { dataRightsHandlers } from './data-rights'

/**
 * One operation's handler, typed by its registry route, plus middleware the route's metadata can't express, such as
 * `requireRecentAuth()`. Mount-all runs authentication, organisation, permission, rate limit and idempotency
 * first, and validates the request before the handler and its response after it (outside production).
 */
export interface HandlerEntry<R extends RouteConfig> {
  handler: RouteHandler<R, ApiEnv>
  middleware?: MiddlewareHandler<ApiEnv>[]
}

export interface AnyHandlerEntry {
  handler: (c: Context<ApiEnv, string, never>) => Response | Promise<Response>
  middleware?: MiddlewareHandler<ApiEnv>[]
}

export type Handlers = { [Id in OperationId]?: HandlerEntry<Operations[Id]> }

/**
 * Every built operation. An owner writes `routes/<area>/index.ts` exporting its entries and spreads them here in one
 * line; an operation without an entry answers 501 `not-built` naming its owner.
 */
export const HANDLERS: Handlers = {
  ...auditHandlers, // a-audit-log
  ...aiKeyHandlers, // e-byok-api
  ...channelHandlers, // c-notice-templates
  ...ledgerHandlers, // c-ledger-chain
  ...subscriberHandlers,
  ...subscriberRightsHandlers,
  ...bundleHandlers, // c-bundle-lifecycle
  ...evidenceHandlers, // c-evidence
  ...gradesHandlers, // c-grades
  ...projectHandlers, // b-projects-api
  ...replyHandlers, // c-recipient-replies
  ...runHandlers, // c-run-orchestrator
  ...approvalHandlers, // c-approval-api
  ...alertHandlers, // c-approver-alerts
  ...notificationHandlers, // c-notifications
  ...onboardingHandlers, // b-create-project-ui
  ...analysisHandlers, // c-analysis-api
  ...dataRightsHandlers, // a-data-rights
  ...memberHandlers, // a-members-api
  ...rotaHandlers, // a-members-api
  ...oauthHandlers // e-mcp-auth
}
