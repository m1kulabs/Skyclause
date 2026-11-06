import { z } from 'zod'

// PRD "Information architecture" and Spec §8 D31.
export const RESERVED_SLUGS = [
  'new',
  'account',
  'developers',
  'connect',
  'approvals',
  'projects',
  'analysis',
  'settings',
  'api',
  'commons',
  'admin',
  'p',
  'c',
  'embed',
  'docs',
  'status',
  'guest',
  'device',
  'sign-in',
  'sign-up',
  'invite',
  'share',
  'subscribe',
  'oauth',
  'ms',
  'legal',
  'skills',
  'oembed',
  'openapi.json',
  '.well-known',
  'v1',
  'mcp',
  'health',
  'healthz',
  'window',
  'elements'
] as const

export type ReservedSlug = (typeof RESERVED_SLUGS)[number]

// Lowercase letters, digits and single hyphens; 2–39 characters, alphanumeric ends.
export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,37}[a-z0-9]$/

const reservedSlugSet = new Set<string>(RESERVED_SLUGS)

export const slugSchema = z
  .string()
  .regex(SLUG_REGEX)
  .refine((slug) => !reservedSlugSet.has(slug), { message: 'reserved slug' })
