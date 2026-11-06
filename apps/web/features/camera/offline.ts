/** Warm the page and its already loaded build assets before claiming offline readiness. */
export async function prepareOffline(path: string) {
  const registration = await navigator.serviceWorker.register(`${path}/worker.js`, { scope: path })
  const worker = registration.active ?? registration.installing ?? registration.waiting
  if (!worker) throw new Error('no-service-worker')
  if (worker.state !== 'activated')
    await new Promise<void>((resolve, reject) => {
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated') resolve()
        if (worker.state === 'redundant') reject(new Error('service-worker-install'))
      })
    })
  const assets = performance
    .getEntriesByType('resource')
    .map((r) => r.name)
    .filter((url) => {
      const parsed = new URL(url)
      return parsed.origin === location.origin && parsed.pathname.startsWith('/_next/static/')
    })
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel()
    const timeout = setTimeout(() => reject(new Error('offline-cache-timeout')), 30_000)
    channel.port1.onmessage = (event) => {
      clearTimeout(timeout)
      channel.port1.close()
      if (event.data === 'ready') resolve()
      else reject(new Error('offline-cache'))
    }
    worker.postMessage({ type: 'warm', assets }, [channel.port2])
  })
}

/** Served below each camera path. It never caches credentials, API traffic or other pages. */
export function cameraWorker(path: string) {
  return `
const pagePath = ${JSON.stringify(path)};
const cacheName = 'skyclause-camera-v1:' + pagePath;
const asset = url => url.origin === self.location.origin && url.pathname.startsWith('/_next/static/');
self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('message', event => {
  if (event.data?.type !== 'warm') return;
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(cacheName);
      const response = await fetch(pagePath, { credentials: 'omit' });
      if (!response.ok) throw new Error('page');
      await cache.put(pagePath, response);
      const urls = event.data.assets.filter(value => asset(new URL(value, self.location.origin)));
      await cache.addAll([...new Set(urls)]);
      event.ports[0]?.postMessage('ready');
    } catch { event.ports[0]?.postMessage('error'); }
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate' && url.origin === self.location.origin && url.pathname === pagePath) {
    event.respondWith((async () => {
      const cache = await caches.open(cacheName);
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(pagePath, response.clone());
        return response;
      } catch { return (await cache.match(pagePath)) || Response.error(); }
    })());
  } else if (asset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(cacheName);
      const saved = await cache.match(event.request);
      if (saved) return saved;
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    })());
  }
});`
}
