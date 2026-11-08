// `bun run --cwd packages/db generate -- --name <plan key>-<what>` (#79 §3 migration rule). Custom SQL (grants, RLS,
// triggers) goes in a `--custom` migration; see src/schema/tenant.ts.
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  schemaFilter: ['public', 'auth']
})
