import type { Operations } from '@skyclause/contracts'
import { createRotaService } from '../../services/rota'
import { inTenant } from '../../tenancy'
import type { HandlerEntry } from '../index'

const camelShift = (body: {
  account_id?: string
  project_id?: string | null
  days?: number[]
  local_start?: string
  local_end?: string
  condition?: string | null
  order?: number
  template?: 'storm_afternoon' | 'surge_night' | 'custom'
}) => ({
  ...(body.account_id === undefined ? {} : { accountId: body.account_id }),
  ...(body.project_id === undefined ? {} : { projectId: body.project_id }),
  ...(body.days === undefined ? {} : { days: body.days }),
  ...(body.local_start === undefined ? {} : { localStart: body.local_start }),
  ...(body.local_end === undefined ? {} : { localEnd: body.local_end }),
  ...(body.condition === undefined ? {} : { condition: body.condition }),
  ...(body.order === undefined ? {} : { order: body.order }),
  ...(body.template === undefined ? {} : { template: body.template })
})

export const rotaHandlers: {
  getRota: HandlerEntry<Operations['getRota']>
  updateRota: HandlerEntry<Operations['updateRota']>
  replaceRotaShifts: HandlerEntry<Operations['replaceRotaShifts']>
  createRotaShift: HandlerEntry<Operations['createRotaShift']>
  updateRotaShift: HandlerEntry<Operations['updateRotaShift']>
  deleteRotaShift: HandlerEntry<Operations['deleteRotaShift']>
} = {
  getRota: {
    handler: async (c) => {
      const query = c.req.valid('query')
      const service = createRotaService(c.get('deps').shiftConditions)
      return c.json(
        (await inTenant(c, (ctx) =>
          service.getRota(ctx, {
            days: query.days,
            projectId: query.project_id,
            at: c.get('deps').now()
          })
        )) as never,
        200
      )
    }
  },
  updateRota: {
    handler: async (c) => {
      const service = createRotaService(c.get('deps').shiftConditions)
      const result = await inTenant(c, (ctx) => service.updateSettings(ctx, c.req.valid('json')))
      return c.json(result as never, 200)
    }
  },
  replaceRotaShifts: {
    handler: async (c) => {
      const body = c.req.valid('json')
      const service = createRotaService(c.get('deps').shiftConditions)
      const result = await inTenant(c, (ctx) =>
        service.replaceShifts(
          ctx,
          {
            projectId: body.project_id,
            templates: body.templates,
            shifts: body.shifts
          },
          c.get('deps').can
        )
      )
      return c.json(result as never, 200)
    }
  },
  createRotaShift: {
    handler: async (c) => {
      const body = c.req.valid('json')
      const service = createRotaService(c.get('deps').shiftConditions)
      const row = await inTenant(c, (ctx) => service.createShift(ctx, camelShift(body) as never, c.get('deps').can))
      return c.json(row as never, 201)
    }
  },
  updateRotaShift: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const service = createRotaService(c.get('deps').shiftConditions)
      const row = await inTenant(c, (ctx) =>
        service.updateShift(ctx, id, camelShift(c.req.valid('json')) as never, c.get('deps').can)
      )
      return c.json(row as never, 200)
    }
  },
  deleteRotaShift: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const service = createRotaService(c.get('deps').shiftConditions)
      await inTenant(c, (ctx) => service.deleteShift(ctx, id, c.get('deps').can))
      return c.body(null, 204)
    }
  }
}
