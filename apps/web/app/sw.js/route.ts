// #155 (c-approver-alerts): the approver-alert service worker (#79 §4, D28), registered at `/sw.js` with scope `/`
// by the "Turn on alerts" card. A push shows its payload under the bundle's tag, so a later alert replaces it;
// a click focuses a window already on the bundle or opens it. An alert never approves anything.
const SCRIPT = `
self.addEventListener('push', (event) => {
  const { title, body, url, tag } = event.data.json();
  event.waitUntil(self.registration.showNotification(title, { body, tag, renotify: true, data: { url } }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data.url;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => client.url === url);
      return open ? open.focus() : self.clients.openWindow(url);
    })
  );
});
`

export async function GET() {
  return new Response(SCRIPT, {
    headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache' }
  })
}
