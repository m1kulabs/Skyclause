/* global process, URL, Headers -- Node's own globals: this file runs inside the spawned server, not the browser. */
// Loaded into a spawned web server with `node --import` by e2e specs only (harness/hero-hosts.ts). The server's own
// reads of API_ORIGIN go to the spec's stand-in API (E2E_API_STAND_IN) instead of the internet, marked as the
// server's, so a spec can tell them from the browser's. Every other request, and every build file, is untouched.
const apiOrigin = process.env.API_ORIGIN
const standIn = process.env.E2E_API_STAND_IN

if (apiOrigin && standIn) {
  const fetchFromHere = globalThis.fetch
  globalThis.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : null
    if (url === null || !url.startsWith(`${apiOrigin}/`)) return fetchFromHere(input, init)
    const headers = new Headers(init.headers)
    headers.set('x-e2e-caller', 'server')
    return fetchFromHere(`${standIn}${url.slice(apiOrigin.length)}`, { ...init, headers })
  }
}
