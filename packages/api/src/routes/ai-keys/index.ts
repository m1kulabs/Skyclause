import type { Operations } from '@skyclause/contracts'
import type { Context } from 'hono'
import type { ApiEnv } from '../../context'
import { requireRecentAuth } from '../../middleware/auth'
import { requireOrg } from '../../middleware/org'
import {
  createMyAiKey as createMyAiKeyService,
  createOrganisationAiKey as createOrganisationAiKeyService,
  deleteMyAiKey as deleteMyAiKeyService,
  deleteOrganisationAiKey as deleteOrganisationAiKeyService,
  getMyAiKeyUsage as getMyAiKeyUsageService,
  getOrganisationAiKeyUsage as getOrganisationAiKeyUsageService,
  getOrganisationAiSettings as getOrganisationAiSettingsService,
  getUsage as getUsageService,
  listMyAiKeys as listMyAiKeysService,
  listOrganisationAiKeys as listOrganisationAiKeysService,
  testMyAiKey as testMyAiKeyService,
  testOrganisationAiKey as testOrganisationAiKeyService,
  updateOrganisationAiKey as updateOrganisationAiKeyService,
  updateOrganisationAiSettings as updateOrganisationAiSettingsService
} from '../../services/ai-keys'
import { ApiError } from '../../problems'
import { inTenant, type ServiceContext } from '../../tenancy'
import type { HandlerEntry } from '../index'

// e-byok-api (#79 §4): organisation and personal AI keys, model settings and usage. Mount-all has checked the
// statement (`ai_keys.manage` on org routes); creates additionally need a fresh sign-in (ACC-8), and the `/me`
// routes settle their organisation from the header so the member-keys flag can be checked.

type Entry<Id extends keyof Operations> = HandlerEntry<Operations[Id]>

/** A failed pre-seal test commits only its attempt history before the route returns the 422. */
async function createWithTestHistory<T>(c: Context<ApiEnv>, create: (ctx: ServiceContext) => Promise<T>): Promise<T> {
  const result = await inTenant(c, async (ctx) => {
    try {
      return { value: await create(ctx) }
    } catch (error) {
      if (error instanceof ApiError && error.slug === 'key-test-failed') return { error }
      throw error
    }
  })
  if (result.error) throw result.error
  return result.value!
}

export const listOrganisationAiKeys: Entry<'listOrganisationAiKeys'> = {
  handler: async (c) => {
    const query = c.req.valid('query')
    return c.json(await inTenant(c, (ctx) => listOrganisationAiKeysService(ctx, query)), 200)
  }
}

export const createOrganisationAiKey: Entry<'createOrganisationAiKey'> = {
  middleware: [requireRecentAuth()],
  handler: async (c) => {
    const body = c.req.valid('json')
    return c.json(await createWithTestHistory(c, (ctx) => createOrganisationAiKeyService(ctx, body)), 201)
  }
}

export const updateOrganisationAiKey: Entry<'updateOrganisationAiKey'> = {
  handler: async (c) => {
    const { id } = c.req.valid('param')
    const body = c.req.valid('json')
    return c.json(await inTenant(c, (ctx) => updateOrganisationAiKeyService(ctx, { id, ...body })), 200)
  }
}

export const deleteOrganisationAiKey: Entry<'deleteOrganisationAiKey'> = {
  handler: async (c) => {
    const { id } = c.req.valid('param')
    await inTenant(c, (ctx) => deleteOrganisationAiKeyService(ctx, id))
    return c.body(null, 204)
  }
}

export const testOrganisationAiKey: Entry<'testOrganisationAiKey'> = {
  handler: async (c) => {
    const { id } = c.req.valid('param')
    return c.json(await inTenant(c, (ctx) => testOrganisationAiKeyService(ctx, id)), 200)
  }
}

export const getOrganisationAiKeyUsage: Entry<'getOrganisationAiKeyUsage'> = {
  handler: async (c) => {
    const query = c.req.valid('query')
    return c.json(await inTenant(c, (ctx) => getOrganisationAiKeyUsageService(ctx, query)), 200)
  }
}

export const getOrganisationAiSettings: Entry<'getOrganisationAiSettings'> = {
  handler: async (c) => c.json(await inTenant(c, getOrganisationAiSettingsService), 200)
}

export const updateOrganisationAiSettings: Entry<'updateOrganisationAiSettings'> = {
  handler: async (c) => {
    const body = c.req.valid('json')
    return c.json(await inTenant(c, (ctx) => updateOrganisationAiSettingsService(ctx, body)), 200)
  }
}

export const getUsage: Entry<'getUsage'> = {
  handler: async (c) => {
    const query = c.req.valid('query')
    return c.json(await inTenant(c, (ctx) => getUsageService(ctx, query)), 200)
  }
}

export const listMyAiKeys: Entry<'listMyAiKeys'> = {
  middleware: [requireOrg],
  handler: async (c) => {
    const query = c.req.valid('query')
    return c.json(await inTenant(c, (ctx) => listMyAiKeysService(ctx, query)), 200)
  }
}

export const createMyAiKey: Entry<'createMyAiKey'> = {
  middleware: [requireOrg, requireRecentAuth()],
  handler: async (c) => {
    const body = c.req.valid('json')
    return c.json(await createWithTestHistory(c, (ctx) => createMyAiKeyService(ctx, body)), 201)
  }
}

export const deleteMyAiKey: Entry<'deleteMyAiKey'> = {
  middleware: [requireOrg],
  handler: async (c) => {
    const { id } = c.req.valid('param')
    await inTenant(c, (ctx) => deleteMyAiKeyService(ctx, id))
    return c.body(null, 204)
  }
}

export const testMyAiKey: Entry<'testMyAiKey'> = {
  middleware: [requireOrg],
  handler: async (c) => {
    const { id } = c.req.valid('param')
    return c.json(await inTenant(c, (ctx) => testMyAiKeyService(ctx, id)), 200)
  }
}

export const getMyAiKeyUsage: Entry<'getMyAiKeyUsage'> = {
  middleware: [requireOrg],
  handler: async (c) => c.json(await inTenant(c, getMyAiKeyUsageService), 200)
}

export const aiKeyHandlers = {
  listOrganisationAiKeys,
  createOrganisationAiKey,
  updateOrganisationAiKey,
  deleteOrganisationAiKey,
  testOrganisationAiKey,
  getOrganisationAiKeyUsage,
  getOrganisationAiSettings,
  updateOrganisationAiSettings,
  getUsage,
  listMyAiKeys,
  createMyAiKey,
  deleteMyAiKey,
  testMyAiKey,
  getMyAiKeyUsage
}
