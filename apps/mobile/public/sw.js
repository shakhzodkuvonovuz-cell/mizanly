// Mizanly Service Worker — app-shell caching + offline fallback
const CACHE_NAME = 'mizanly-v1';
const STATIC_CACHE = 'mizanly-static-v1';

const APP_SHELL_URLS = [
  '/',
  '/manifest.json',
];

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Mizanly — Offline</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0D1117;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      text-align: center;
      padding: 24px;
    }
    .container { max-width: 360px; }
    .icon {
      width: 64px; height: 64px;
      margin: 0 auto 24px;
      border-radius: 16px;
      background: #0A7B4F;
      display: flex; align-items: center; justify-content: center;
      font-size: 28px;
    }
    h1 { font-size: 22px; margin-bottom: 12px; }
    p { font-size: 15px; color: #8B949E; line-height: 1.5; margin-bottom: 24px; }
    button {
      background: #0A7B4F;
      color: #fff;
      border: none;
      padding: 12px 32px;
      border-radius: 9999px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
    }
    button:active { opacity: 0.8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">M</div>
    <h1>You're offline</h1>
    <p>Check your internet connection and try again. Mizanly needs a network connection to load content.</p>
    <button onclick="location.reload()">Try again</button>
  </div>
</body>
</html>`;

// Install — cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_URLS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== STATIC_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch — strategy depends on request type
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // API calls — network first, no cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => new Response(
        JSON.stringify({ error: 'offline', message: 'No network connection' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      ))
    );
    return;
  }

  // Static assets (images, fonts, JS, CSS) — cache first
  if (
    request.destination === 'image' ||
    request.destination === 'font' ||
    request.destination === 'style' ||
    request.destination === 'script' ||
    url.pathname.match(/\.(js|css|woff2?|ttf|png|jpg|jpeg|svg|webp|ico)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Navigation / HTML — network first, fallback to cache, then offline page
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => {
            if (cached) return cached;
            return new Response(OFFLINE_HTML, {
              status: 200,
              headers: { 'Content-Type': 'text/html' },
            });
          })
        )
    );
    return;
  }

  // Everything else — network first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
