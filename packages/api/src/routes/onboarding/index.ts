import type { Handlers } from '..'
import { requireOrg } from '../../middleware/org'
import { getOnboarding, setOnboardingStepSkipped } from '../../services/onboarding'
import { inTenant } from '../../tenancy'

export const onboardingHandlers: Handlers = {
  getOnboarding: {
    middleware: [requireOrg],
    handler: async (c) => {
      const result = await inTenant(c, (ctx) => getOnboarding(ctx, ctx.tx.orgId!, { now: c.get('deps').now() }))
      return c.json(result as never, 200)
    }
  },
  skipOnboardingStep: {
    middleware: [requireOrg],
    handler: async (c) => {
      const { step } = c.req.valid('param')
      const result = await inTenant(c, (ctx) =>
        setOnboardingStepSkipped(ctx, ctx.tx.orgId!, step, true, { now: c.get('deps').now() })
      )
      return c.json(result as never, 200)
    }
  },
  resumeOnboardingStep: {
    middleware: [requireOrg],
    handler: async (c) => {
      const { step } = c.req.valid('param')
      const result = await inTenant(c, (ctx) =>
        setOnboardingStepSkipped(ctx, ctx.tx.orgId!, step, false, { now: c.get('deps').now() })
      )
      return c.json(result as never, 200)
    }
  }
}
