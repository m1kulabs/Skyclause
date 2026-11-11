import { readdirSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
const database = readFileSync(new URL('../infra/environments/production/database.tf', import.meta.url), 'utf8')
const migrations = new URL('../packages/db/migrations/', import.meta.url)
const sql = readdirSync(migrations)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => readFileSync(new URL(name, migrations), 'utf8'))
// The logins Terraform creates: every `local.database_logins` value except Neon's own `migrator`.
const logins = [
  ...database
    .split('database_logins = {')[1]!
    .split('}')[0]!
    .matchAll(/=\s*"(\w+)"/g)
]
  .map((match) => match[1]!)
  .filter((name) => name !== 'migrator')
const names = (list: string) =>
  list
    .replace(/\s+WITH\s[\s\S]*$/i, '')
    .split(',')
    .map((name) => name.trim().replace(/^"|"$/g, ''))
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '')
// `GRANT <role> TO <member>`: unlike a privilege grant it has no ON. Dynamic SQL in `EXECUTE format(...)` counts.
const memberships = (text: string) =>
  [...code(text).matchAll(/\bGRANT\s+((?:(?!\bON\b)[^;'])+?)\s+TO\s+([^;'(]+)/gi)].flatMap((match) =>
    names(match[2]!)
      .filter((member) => logins.includes(member))
      .flatMap((member) => names(match[1]!).map((role) => `${role} -> ${member}`))
  )
const alterations = (text: string) =>
  [...code(text).matchAll(/\bALTER\s+(?:ROLE|USER)\s+"?(\w+)"?/gi)]
    .map((match) => match[1]!)
    .filter((name) => logins.includes(name))
test('Terraform leaves the role memberships of its logins to the migrations that grant them', () => {
  expect(logins).toEqual(['app', 'auth_app', 'system', 'retention'])
  expect(
    memberships(`GRANT public_reader TO app WITH INHERIT FALSE, SET TRUE;
      GRANT SELECT, UPDATE (a) ON t TO app, "system"; -- GRANT owner TO retention
      GRANT USAGE ON SCHEMA auth TO auth_app;
      EXECUTE format('GRANT %I TO "system"', r)`)
  ).toEqual(['public_reader -> app', '%I -> system'])
  // Terraform reads every membership back, and an unset `roles` means none, so the plan would revoke these.
  expect(sql.flatMap(memberships)).toContain('public_reader -> app')
  const login = database.split('resource "postgresql_role" "login"')[1]!.split('\n}\n')[0]!
  expect(login).toMatch(/ignore_changes\s*=\s*\[[^\]]*\broles\b/)
  expect(login).not.toMatch(/^\s*roles\s*=/m)
})
test('no migration alters a Terraform-made login, which Terraform would read back as drift', () => {
  expect(alterations('ALTER ROLE app SET search_path = x; alter user "system" CONNECTION LIMIT 3;')).toEqual([
    'app',
    'system'
  ])
  expect(alterations('UPDATE m SET role = 1; ALTER ROLE owner NOLOGIN; /* ALTER ROLE app */')).toEqual([])
  expect(sql.flatMap(alterations)).toEqual([])
})
