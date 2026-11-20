const CACHE = "classroom-fe3bfa4dc3";
const FILES = ["./", "data/bank.json", "icons/icon-192.png", "icons/icon-512.png", "index.html", "manifest.webmanifest", "static/app.css", "static/app.js", "static/content.js", "static/core/jalali.js", "static/core/planner.js", "static/core/store.js", "static/fonts.css", "static/guide.html", "static/index.html", "static/vendor/Vazirmatn-wght.woff2", "static/vendor/html2canvas.min.js"];
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys()
  .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
