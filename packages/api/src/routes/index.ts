import type { RouteConfig, RouteHandler } from '@hono/zod-openapi'
import type { OperationId, Operations } from '@skyclause/contracts'
import type { Context, MiddlewareHandler } from 'hono'
import type { ApiEnv } from '../context'
import { ledgerHandlers } from './ledger'
import { subscriberHandlers } from './subscribers'

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
  ...ledgerHandlers, // c-ledger-chain
  ...subscriberHandlers
}
