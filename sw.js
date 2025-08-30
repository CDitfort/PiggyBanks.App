/* Service Worker for Piggybanks.app - enables installability and basic offline support */

const CACHE_NAME = 'piggybanks-cache-v2';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/register.html',
  '/dashboard.html',
  '/css/styles.css',
  '/css/additions.css',
  '/js/pwa.js',
  '/js/config.js',
  '/js/auth.js',
  '/js/login.js',
  '/js/register.js',
  '/js/api.js',
  '/js/dashboard.js',
  '/manifest.webmanifest',
  '/images/piggy-bank-icon-smaller.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => Promise.resolve())
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : undefined)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Ignore cross-origin (e.g., reCAPTCHA, APIs, CDNs). Let the network handle these.
  if (url.origin !== location.origin) return;

  // Never cache dynamic function/API responses to avoid stale verification results
  if (url.pathname.startsWith('/.netlify/functions/')) {
    event.respondWith(fetch(req));
    return;
  }

  // App shell navigation: network-first with fallback to cache and then to index.html
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }

  // Static assets:
  // - Always try network-first for scripts/styles so latest code is used immediately.
  // - Use cache-first for images/fonts for performance.
  const dest = req.destination;
  if (dest === 'script' || dest === 'style') {
    event.respondWith(networkFirst(req));
    return;
  }
  if (dest === 'image' || dest === 'font') {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Default: try the network, fall back to cache
  event.respondWith(networkFallbackCache(req));
});

async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    // Clone and save only successful responses
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (_) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Fallback to the home page for navigations when offline
    return caches.match('/index.html');
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (_) {
    return cached || Response.error();
  }
}

async function networkFallbackCache(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (_) {
    return caches.match(request);
  }
}