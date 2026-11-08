// Vitest setupFiles: before each test file, the worker's database is dropped and cloned afresh from the template, and
// every DATABASE_URL_* (#79 §6) points at it, so parallel workers never share rows.
import { afterAll, inject } from 'vitest'
import { closeConnections } from '../../src/client'
import { localUrl } from '../../scripts/local'
import { createDatabase, dropDatabase } from '.'

const template = inject('dbTemplate')
const database = `${template}_w${process.env.VITEST_POOL_ID ?? '1'}`
await dropDatabase(database)
await createDatabase(database, template)

process.env.SKYCLAUSE_TEST_DATABASE = database
process.env.DATABASE_URL_APP = localUrl('app', database)
process.env.DATABASE_URL_AUTH = localUrl('auth_app', database)
process.env.DATABASE_URL_SYSTEM = localUrl('system', database)
process.env.DATABASE_URL_RETENTION = localUrl('retention', database)
process.env.DATABASE_URL_MIGRATE = localUrl('migrator', database)

afterAll(() => closeConnections())
