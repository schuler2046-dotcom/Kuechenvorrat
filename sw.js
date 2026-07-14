// Service Worker: cached nur App-Code und Assets, NIE Nutzdaten.
// Bei jeder Änderung an den App-Dateien die Cache-Version hochzählen!
const CACHE = 'vorrat-v9';

const PRECACHE = [
  './',
  './index.html',
  './app.js',
  './store.js',
  './firebase-config.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if(event.request.method !== 'GET') return;

  // Firestore/Auth-Traffic nie anfassen.
  if(url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('firebaseio.com')) return;

  // Google Fonts: cache-first zur Laufzeit, damit die Schrift auch offline da ist.
  if(url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' || url.hostname === 'www.gstatic.com'){
    event.respondWith(
      caches.match(event.request).then(hit => hit || fetch(event.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return res;
      }).catch(() => hit))
    );
    return;
  }

  // Eigene Dateien: cache-first mit Hintergrund-Aktualisierung.
  if(url.origin === location.origin){
    event.respondWith(
      caches.match(event.request).then(hit => {
        const net = fetch(event.request).then(res => {
          if(res && res.ok){
            const copy = res.clone();
            caches.open(CACHE).then(cache => cache.put(event.request, copy));
          }
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
  }
});
