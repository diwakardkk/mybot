/**
 * ZeptAI — Service Worker (Basic PWA Cache)
 * ──────────────────────────────────────────────────────────────
 * Provides offline shell caching for faster loads.
 * Does NOT cache API responses (patient data stays server-side).
 */

const CACHE_NAME   = 'zeptai-v1';
const STATIC_SHELL = [
  '/',
  '/auth',
  '/dashboard',
  '/static/style.css',
  '/static/landing.css',
  '/static/auth.css',
  '/static/dashboard.css',
  '/static/app.js',
  '/static/landing.js',
  '/static/logo.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
];

/* ── Install ─────────────────────────────────────────────────────────────── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_SHELL).catch((e) => {
        console.warn('[SW] Could not cache some resources:', e);
      });
    })
  );
  self.skipWaiting();
});

/* ── Activate ────────────────────────────────────────────────────────────── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* ── Fetch ───────────────────────────────────────────────────────────────── */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  /* Always pass API calls through to network */
  if (url.pathname.startsWith('/api/')) {
    return;
  }
  /* Pass Firebase requests through */
  if (url.hostname.includes('firebase') || url.hostname.includes('googleapis')) {
    return;
  }

  /* Stale-while-revalidate for static assets */
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request).then((res) => {
          if (res && res.status === 200) {
            const cloned = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, cloned));
          }
          return res;
        }).catch(() => {});
        return cached || networkFetch;
      })
    );
  }
});
