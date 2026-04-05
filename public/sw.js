const CACHE_NAME = 'streamcorn-v3'
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  // App icons
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/streamcorn_full_logo.png',
  '/icons/home.svg',
  '/icons/browse.svg',
  '/icons/search.svg',
  '/icons/user.svg',
  '/icons/gpay.svg',
  '/icons/phonepe.svg',
  '/icons/paytm.svg',
  '/icons/upi.svg',
  // Platform logos
  '/platforms/netflix.webp',
  '/platforms/prime_video.png',
  '/platforms/appletv.png',
  '/platforms/crunchyroll.png',
  '/platforms/hulu.svg',
  '/platforms/sonyliv.jpeg',
  '/platforms/zee5.png',
  // Avatars (all 22)
  '/avatars/alien.png',
  '/avatars/chicken.png',
  '/avatars/dark_grey_smile.png',
  '/avatars/dog.png',
  '/avatars/dusty_chilleez.png',
  '/avatars/eyepatch.png',
  '/avatars/green_smile.png',
  '/avatars/helmet.png',
  '/avatars/moustache.png',
  '/avatars/mummy.png',
  '/avatars/pink_giggle.png',
  '/avatars/pink_smile.png',
  '/avatars/purple_penguin.png',
  '/avatars/purple_smile.png',
  '/avatars/purple_superhero.png',
  '/avatars/red_smile.png',
  '/avatars/red_superhero.png',
  '/avatars/robin_chilleez.png',
  '/avatars/robot.png',
  '/avatars/scarlet_chilleez.png',
  '/avatars/sunny_chilleez.png',
  '/avatars/yellow_smile.png',
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

  if (request.method !== 'GET') return

  // Never intercept: Next.js chunks, API calls, stream/HLS requests
  if (
    request.url.includes('/_next/') ||
    request.url.includes('/api/') ||
    request.url.includes('.m3u8') ||
    request.url.includes('.ts')
  ) return

  // Cache-first for static assets, network-first for pages
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/'))
    )
    return
  }

  // Images from TMDB: cache after first fetch (stale-while-revalidate)
  if (request.url.includes('image.tmdb.org')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
        return cached || fetchPromise
      })
    )
    return
  }

  // Everything else: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      })
    })
  )
})
