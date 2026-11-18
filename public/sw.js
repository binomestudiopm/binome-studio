const CACHE_NAME = 'binome-studio-static-v1';

function isCacheableStaticAsset(request, url) {
  if (request.method !== 'GET' || url.origin !== self.location.origin) return false;
  if (url.search) return false;

  // Never intercept navigation, API, authentication, or personalized routes.
  if (request.mode === 'navigate' || /^\/(api|auth|login|logout|account|profile)(\/|$)/i.test(url.pathname)) {
    return false;
  }

  return url.pathname.startsWith('/_next/static/') || url.pathname === '/icon.svg';
}

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith('binome-studio-static-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (!isCacheableStaticAsset(event.request, url)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(event.request);
      if (cached) return cached;

      const response = await fetch(event.request);
      const cacheControl = response.headers.get('Cache-Control') || '';
      if (response.ok && response.type === 'basic' && !/private|no-store/i.test(cacheControl)) {
        await cache.put(event.request, response.clone());
      }
      return response;
    })
  );
});
