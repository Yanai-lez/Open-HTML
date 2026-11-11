// Service worker: offline support + receiving shared HTML from other apps.
var CACHE = 'open-html-v5';
var SHARE_CACHE = 'open-html-share';
var FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.ico',
  './apple-touch-icon.png',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './vendor/prism-bundle.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) { return cache.addAll(FILES); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys
        .filter(function (k) { return k !== CACHE && k !== SHARE_CACHE; })
        .map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

// Another app shared an HTML file (or text) to this app.
// Stash it, then redirect to the page, which loads it into the text box.
function handleShare(request) {
  return request.formData().then(function (form) {
    var file = form.get('file');
    var read;
    var name = '';
    if (file && typeof file !== 'string' && file.size) {
      name = file.name || '';
      read = file.text();
    } else {
      var text = (form.get('text') || '').toString();
      if (!text) text = (form.get('url') || '').toString();
      read = Promise.resolve(text);
    }
    return read.then(function (text) {
      return caches.open(SHARE_CACHE).then(function (cache) {
        return cache.put('shared', new Response(
          JSON.stringify({ text: text, name: name }),
          { headers: { 'Content-Type': 'application/json' } }
        ));
      });
    });
  }).catch(function () {
    // Nothing usable was shared; just open the app.
  }).then(function () {
    return Response.redirect(self.registration.scope + '?share=1', 303);
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;

  if (request.method === 'POST' && new URL(request.url).pathname.endsWith('/share-target')) {
    event.respondWith(handleShare(request));
    return;
  }

  if (request.method !== 'GET') return;

  // Network first (so updates show up), cache as the offline fallback.
  event.respondWith(
    fetch(request).then(function (response) {
      var copy = response.clone();
      caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
      return response;
    }).catch(function () {
      return caches.match(request).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});
