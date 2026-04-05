const CACHE_NAME = 'streamcorn-v2'
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/streamcorn_full_logo.png',
  '/icons/home.svg',
  '/icons/browse.svg',
  '/icons/search.svg',
  '/icons/user.svg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Skip non-GET requests
  if (request.method !== 'GET') return

  // Never intercept: Next.js chunks, API calls, stream/HLS requests
  if (
    request.url.includes('/_next/') ||
    request.url.includes('/api/') ||
    request.url.includes('.m3u8') ||
    request.url.includes('.ts')
  ) return

  // Cache-first for static assets only
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        if (response.ok && request.mode !== 'navigate') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      })
    })
  )
})
