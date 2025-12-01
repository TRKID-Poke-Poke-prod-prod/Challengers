console.log('[Service Worker] File loaded successfully');

self.addEventListener('install', function(event) {
  console.log('[Service Worker] Installing Service Worker ...', event);
  
  // Skip waiting to activate immediately
  self.skipWaiting();
  
  // Cache only files that definitely exist
  event.waitUntil(
    caches.open('challenger-cache-v1').then(function(cache) {
      console.log('[Service Worker] Caching app shell');
      
      // Try to cache files, but don't fail if some are missing
      return cache.addAll([
        '/',
      ]).catch(function(error) {
        console.error('[Service Worker] Cache addAll failed:', error);
        // Don't throw - allow installation to continue
      });
    }).then(function() {
      console.log('[Service Worker] Install completed successfully');
    }).catch(function(error) {
      console.error('[Service Worker] Install failed:', error);
    })
  );
});

self.addEventListener('activate', function(event) {
  console.log('[Service Worker] Activating Service Worker ...', event);
  
  // Take control of all pages immediately
  event.waitUntil(
    clients.claim().then(function() {
      console.log('[Service Worker] Claimed all clients');
    })
  );
  
  // Clean up old caches
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== 'challenger-cache-v1') {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', function(event) {
  // Only log occasionally to avoid spam
  if (Math.random() < 0.01) {
    console.log('[Service Worker] Fetching:', event.request.url);
  }
  
  event.respondWith(
    caches.match(event.request).then(function(response) {
      if (response) {
        return response; // Serve from cache
      }
      return fetch(event.request); // Go to network
    })
  );
});

console.log('[Service Worker] Script execution completed');