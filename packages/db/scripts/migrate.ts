// `bun run db:migrate`: migrates DATABASE_URL_MIGRATE, else the local container (`bun run db:up`).
import { migrate } from '../src/migrate'
import { localUrl, migrationsFolder } from './local'

const url = process.env.DATABASE_URL_MIGRATE ?? localUrl('migrator')
const applied = await migrate(url, migrationsFolder)
console.log(applied.length ? applied.map((tag) => `applied ${tag}`).join('\n') : 'no pending migrations')
