const CACHE_NAME = 'vku-survey-v1.1.0';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Install Event: Pre-cache static assets (App Shell)
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing & Caching App Shell...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Cleanup old caches
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating & Cleaning old caches...');
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Cache-First strategy with Network Fallback for Zero-Connectivity Offline Usage
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Bypass cache for API endpoints
  if (event.request.url.includes('/api/') || event.request.url.includes('jsonplaceholder') || event.request.url.includes('mockapi')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Stale-While-Revalidate background update if online
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          })
          .catch(() => {
            /* Silently handle offline mode */
          });

        return cachedResponse;
      }

      // If not cached, fetch from network and cache
      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return networkResponse;
        })
        .catch(() => {
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html');
          }
        });
    })
  );
});

// Background Sync API Handler
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-vku-surveys') {
    console.log('[ServiceWorker] Background Sync Triggered!');
    event.waitUntil(notifyClientsToSync());
  }
});

async function notifyClientsToSync() {
  const clientsList = await self.clients.matchAll();
  for (const client of clientsList) {
    client.postMessage({ type: 'TRIGGER_SYNC' });
  }
}
