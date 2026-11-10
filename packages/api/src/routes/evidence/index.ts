import type { Handlers } from '..'
import {
  approveEvidenceRequest,
  createEvidenceRequest,
  getEvidenceRequest,
  listEvidenceRequests,
  sendEvidenceReply,
  type EvidenceRequestView
} from '../../services/evidence'
import { inTenant } from '../../tenancy'

// #159 c-evidence: `GET` and `POST /v1/projects/{id}/evidence-requests`, `GET /v1/evidence-requests/{id}`
// (`evidence.request`) and `POST /api/evidence-requests/{id}/approve` (`bundle.approve`, a session; no recent-auth
// step, which #79 §4 keeps for bundles).

// The pack's nested JSON values are too deep for Hono's typed `c.json`; the services' return type and the mount's
// response check (outside production) hold the shape instead.
const packBody = (view: EvidenceRequestView) => view as never

export const evidenceHandlers: Handlers = {
  listEvidenceRequests: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const { limit, cursor } = c.req.valid('query')
      const { can } = c.get('deps')
      return c.json(
        await inTenant(c, (ctx) => listEvidenceRequests(ctx, { can }, { projectId: id, limit, cursor })),
        200
      )
    }
  },
  createEvidenceRequest: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const body = c.req.valid('json')
      const { can, now } = c.get('deps')
      const view = await inTenant(c, (ctx) =>
        createEvidenceRequest(ctx, { can, now: now() }, { ...body, projectId: id })
      )
      return c.json(packBody(view), 202)
    }
  },
  getEvidenceRequest: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const { can, now } = c.get('deps')
      const view = await inTenant(c, (ctx) => getEvidenceRequest(ctx, { can, now: now() }, id))
      return c.json(packBody(view), 200)
    }
  },
  approveEvidenceRequest: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const deps = c.get('deps')
      const { request, outbox } = await inTenant(c, (ctx) =>
        approveEvidenceRequest(ctx, { can: deps.can, now: deps.now() }, id)
      )
      // After commit: the email reply's outbox row exists, so a failed send is recorded on it, never lost.
      if (outbox) await sendEvidenceReply(deps, c.get('principal')!, outbox)
      return c.json(request, 200)
    }
  }
}
