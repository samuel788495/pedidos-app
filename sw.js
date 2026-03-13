// ============================================
// Service Worker — Pedidos GrupoMark
// Cache First para estáticos
// Network Only para API de Dolibarr
// ============================================

const CACHE_NAME = 'pedidos-grupomark-v9';

const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// --- INSTALL: pre-cachear archivos estáticos ---
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-cacheando archivos estáticos');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// --- ACTIVATE: limpiar cachés anteriores ---
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// --- FETCH: enrutar según tipo de recurso ---
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network Only para cualquier request a la API de Dolibarr
  // NO interceptar bajo ninguna circunstancia
  if (url.hostname === '192.168.1.115' || url.pathname.includes('/api/')) {
    return;
  }

  // Cache First para archivos estáticos
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return networkResponse;
      });
    })
  );
});
