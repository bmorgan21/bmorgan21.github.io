// Offline app shell for Fitness Tracker (v3).
// Rules: only cache complete, successful, non-redirected responses. Never cache opaque responses,
// fonts, or Supabase API/auth calls. A broken network response must never be saved and replayed.
const VERSION = 'ft-v3';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-180.png'];
const SUPABASE_LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';

const cacheable = (res) => res && res.ok && !res.redirected && (res.type === 'basic' || res.type === 'cors');

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.all(SHELL.map(async (url) => {
      try { const res = await fetch(url, { cache: 'reload' }); if (cacheable(res)) await cache.put(url, res); } catch (e) {}
    }));
    // Fetched with CORS so we store a real, readable response (not an opaque one) for offline launches
    try { const res = await fetch(SUPABASE_LIB, { mode: 'cors' }); if (cacheable(res)) await cache.put(SUPABASE_LIB, res); } catch (e) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!/^https?:$/.test(url.protocol)) return;
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) return;   // live data only

  // Page loads: network first. Fall back to the saved page only if the network fails or the server errors.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        // 'no-cache' = always revalidate, so a new deploy reaches installed apps immediately
        // (GitHub Pages otherwise lets browsers reuse the page for up to 10 minutes)
        const res = await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
        if (cacheable(res)) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put('index.html', copy)); }
        if (res.status >= 500) { const saved = await caches.match('index.html'); if (saved) return saved; }
        return res;
      } catch (e) {
        return (await caches.match('index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // The Supabase library: serve the saved copy so the app can start offline
  if (url.href === SUPABASE_LIB) {
    event.respondWith(caches.match(SUPABASE_LIB).then((saved) => saved || fetch(req)));
    return;
  }

  // Our own static files: saved copy first, refreshed in the background
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((saved) => {
        const fresh = fetch(req).then((res) => {
          if (cacheable(res)) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
          return res;
        }).catch(() => saved);
        return saved || fresh;
      })
    );
  }
});
