// For a test file in a project without #79 §7's setupFiles (apps/web, whose jsdom tests can't run them): import this
// first to get the file's own test database and the test web env. The project still needs databaseTest's globalSetup.
import '@skyclause/db/test/harness/worker-setup'
import './setup'
