const BASE = new URL('./', self.location.href).pathname;
const CACHE_NAME = `prism-shell-v3-${BASE}`;
const APP_SHELL = ['', 'manifest.webmanifest', 'favicon.svg', 'og.png'].map(
  (path) => BASE + path,
);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith('prism-shell-') && key !== CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (
    event.request.method !== 'GET' ||
    new URL(event.request.url).origin !== self.location.origin
  )
    return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() =>
        caches
          .match(event.request)
          .then(
            (cached) =>
              cached ||
              (event.request.mode === 'navigate'
                ? caches.match(BASE)
                : Response.error()),
          ),
      ),
  );
});

self.addEventListener('message', (event) => {
  if (
    event.data?.type !== 'PRISM_CACHE_SHELL' ||
    !Array.isArray(event.data.urls)
  )
    return;
  const urls = [...new Set(event.data.urls)]
    .filter((value) => {
      try {
        const url = new URL(value);
        return (
          url.origin === self.location.origin &&
          url.pathname.startsWith(BASE) &&
          /\.(?:js|mjs|css|woff2?|svg|png)$/i.test(url.pathname)
        );
      } catch {
        return false;
      }
    })
    .slice(0, 500);
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.all(urls.map((url) => cache.add(url).catch(() => {}))),
      ),
  );
});
