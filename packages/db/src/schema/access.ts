import { sql } from 'drizzle-orm'
import { boolean, foreignKey, integer, text, unique, uuid } from 'drizzle-orm/pg-core'
import { organization } from './auth'
import { id, instant, orgKey, sameOrg, tenantTable, timestamps } from './columns'
import { keyOwner } from './enums'
import { run } from './runs'
import { shareLink } from './windows'

// #79 §3 rows for `e-mcp-auth`, `e-console-api` and `e-byok-api`, and TRD's ai_key and ai_usage. All T.

/** An OAuth grant scoped to projects (D37); `share_link_id` set for a link-bound reviewer grant. */
export const oauthGrant = tenantTable(
  'oauth_grant',
  {
    id: id(),
    clientId: text('client_id').notNull(),
    accountId: uuid('account_id').notNull(),
    projectIds: uuid('project_ids').array(),
    scopes: text('scopes')
      .array()
      .notNull()
      .default(sql`'{}'`),
    shareLinkId: uuid('share_link_id'),
    revokedAt: instant('revoked_at'),
    ...timestamps()
  },
  (self) => [
    foreignKey({ columns: [self.orgId], foreignColumns: [organization.id] }).onDelete('cascade'),
    sameOrg('oauth_grant_share_link', self, self.shareLinkId, shareLink, true)
  ]
)

/** A confidential OAuth client registered for one organisation (D5, Gemini Enterprise). */
export const oauthOrgClient = tenantTable(
  'oauth_org_client',
  {
    id: id(),
    clientId: text('client_id').notNull().unique(),
    revokedAt: instant('revoked_at'),
    ...timestamps()
  },
  (self) => [foreignKey({ columns: [self.orgId], foreignColumns: [organization.id] }).onDelete('cascade')]
)

/** A playground `skg_` token; carries the issuing session's device and IP hashes (`guestContext`). */
export const guestToken = tenantTable(
  'guest_token',
  {
    id: id(),
    accountId: uuid('account_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    scopes: text('scopes')
      .array()
      .notNull()
      .default(sql`'{}'`),
    deviceHash: text('device_hash'),
    ipHash: text('ip_hash'),
    expiresAt: instant('expires_at').notNull(),
    revokedAt: instant('revoked_at'),
    createdAt: instant('created_at').notNull().defaultNow()
  },
  (self) => [foreignKey({ columns: [self.orgId], foreignColumns: [organization.id] }).onDelete('cascade')]
)

/** A sealed BYOK key (D39): the organisation's, or one member's when `owner_type` is `account`. */
export const aiKey = tenantTable(
  'ai_key',
  {
    id: id(),
    ownerType: keyOwner('owner_type').notNull(),
    accountId: uuid('account_id'),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    last4: text('last4').notNull(),
    fingerprint: text('fingerprint').notNull(),
    ciphertext: text('ciphertext').notNull(),
    wrappedDek: text('wrapped_dek').notNull(),
    kekVersion: text('kek_version').notNull(),
    declaredTier: text('declared_tier').notNull(),
    priority: integer('priority').notNull().default(0),
    enabled: boolean('enabled').notNull().default(true),
    ...timestamps()
  },
  (self) => [
    orgKey('ai_key', self),
    foreignKey({ columns: [self.orgId], foreignColumns: [organization.id] }).onDelete('cascade'),
    unique('ai_key_org_id_fingerprint_key').on(self.orgId, self.fingerprint)
  ]
)

/** Model tokens one run used (`e-byok-api`); append-only. `ai_key_id` null is platform Vertex. */
export const aiUsage = tenantTable(
  'ai_usage',
  {
    id: id(),
    runId: uuid('run_id'),
    aiKeyId: uuid('ai_key_id'),
    model: text('model').notNull(),
    tokensIn: integer('tokens_in').notNull(),
    tokensOut: integer('tokens_out').notNull(),
    createdAt: instant('created_at').notNull().defaultNow()
  },
  (self) => [
    foreignKey({ columns: [self.orgId], foreignColumns: [organization.id] }).onDelete('cascade'),
    sameOrg('ai_usage_run', self, self.runId, run, true),
    sameOrg('ai_usage_ai_key', self, self.aiKeyId, aiKey, true)
  ]
)
