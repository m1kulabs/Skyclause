/** `GET /health` on every host: never touches the database (D45); deploy smoke and uptime checks read `ok`. */
export const health = (): Response => new Response('ok', { headers: { 'Cache-Control': 'no-store' } })
