const CACHE_NAME = "dobo-patrol-v6";
const ASSETS = [
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./vendor/xlsx.full.min.js",
  "./vendor/jszip.min.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./maps/yesan-1-3.png",
  "./maps/yesan-4.png",
  "./maps/yesan-5.png",
  "./maps/hongseong-1-4.png",
  "./maps/hongseong-5.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
