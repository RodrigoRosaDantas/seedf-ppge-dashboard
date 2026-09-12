const CACHE_NAME = "seedf-pages-v2";
const CORE_ASSETS = [
  "./",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./leis/index.html",
  "./leis/flashcards/index.html",
  "./data/seedf-snapshot.json",
  "./data/leis-primeiro.json",
  "./data/legislation-bank.json",
  "./data/leis-primeiro-flashcards.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith("seedf-pages-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

function cacheResponse(request, response) {
  if (!response || !response.ok) return response;
  const copy = response.clone();
  void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || !isSameOrigin(request)) return;

  const url = new URL(request.url);
  const acceptsHtml = request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html");
  const isStaticAsset = /\.(?:css|js|json|svg|webmanifest|woff2?)$/i.test(url.pathname);

  if (acceptsHtml) {
    event.respondWith(
      fetch(request)
        .then((response) => cacheResponse(request, response))
        .catch(() => caches.match(request).then((cached) => cached || caches.match(new URL("./", self.registration.scope).href))),
    );
    return;
  }

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => cacheResponse(request, response))
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});
