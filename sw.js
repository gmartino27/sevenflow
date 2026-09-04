// Service Worker for SevenFlow PWA
const CACHE_NAME = 'sevenflow-v117';
const urlsToCache = [
    './',
    './index.html',
    './css/main.css',
    './css/tasks.css',
    './css/modals.css',
    './css/modals/base.css',
    './css/modals/ramble.css',
    './css/modals/import.css',
    './css/backlog.css',
    './js/sevenflow.js',
    './js/auth.js',
    './js/firestore.js',
    './js/plugins.js',
    './js/sevenflow/dragdrop-manager.js',
    './js/sevenflow/backlog-tombstones.js',
    './js/sevenflow/mobile-nav-manager.js',
    './js/sevenflow/i18n-manager.js',
    './js/sevenflow/notifications-manager.js',
    './js/sevenflow/pwa-manager.js',
    './plugins/task-api/plugin.js',
    './plugins/google-login/plugin.js',
    './plugins/google-calendar/plugin.js',
    './manifest.json',
    './favicon.png',
    './icon-192.png',
    './icon-512.png'
];

// Install event - cache files
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                // Cache files individually to prevent errors
                return Promise.allSettled(
                    urlsToCache.map(url =>
                        cache.add(url).catch(err => {
                            console.warn('Failed to cache:', url, err);
                        })
                    )
                );
            })
    );
    self.skipWaiting();
});

// Fetch event - Network first for HTML, cache first for assets
self.addEventListener('fetch', (event) => {
    const { request } = event;

    // Only handle http and https requests
    if (!request.url.startsWith('http')) {
        return;
    }

    const url = new URL(request.url);

    // Never cache internal API calls
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(fetch(request));
        return;
    }
    
    // Never cache Firebase or external API calls
    if (url.origin.includes('firebase') || 
        url.origin.includes('googleapis') ||
        url.origin.includes('gstatic')) {
        event.respondWith(fetch(request));
        return;
    }
    
    // Only cache requests from our own origin
    if (url.origin !== location.origin) {
        event.respondWith(fetch(request));
        return;
    }

    // Network-first for HTML pages to ensure fresh auth state
    if (request.mode === 'navigate' || request.destination === 'document' || 
        url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname === '/index.html') {
        
        event.respondWith(
            fetch(request)
                .then((response) => {
                    // Only cache successful responses
                    if (response && response.status === 200) {
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, responseToCache).catch(err => {
                                // Silently ignore cache errors
                            });
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // Fallback to cache if offline
                    return caches.match(request);
                })
        );
        return;
    }
    
    // Cache-first for other assets
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Cache hit - return response
                if (response) {
                    return response;
                }
                
                // Clone the request
                const fetchRequest = event.request.clone();
                
                return fetch(fetchRequest).then((response) => {
                    // Check if valid response
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }
                    
                    // Clone the response
                    const responseToCache = response.clone();
                    
                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(event.request, responseToCache).catch(err => {
                                // Silently ignore cache errors
                            });
                        });
                    
                    return response;
                });
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME];
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    
    return self.clients.claim();
});
