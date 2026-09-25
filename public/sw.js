const CACHE_NAME = "seedf-pages-v6";
const CORE_ASSETS = [
  "./",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./reading-preferences.css",
  "./reading-preferences.js",
  "./leis-enhanced.css",
  "./leis/index.html",
  "./leis/flashcards/index.html",
  "./hoje/index.html",
  "./mentor/index.html",
  "./desempenho/index.html",
  "./riscos/index.html",
  "./erros/index.html",
  "./revisoes/index.html",
  "./edital/index.html",
  "./qualidade/index.html",
  "./trilha/index.html",
  "./data/seedf-snapshot.json",
  "./data/leis-primeiro.json",
  "./data/legislation-bank.json",
  "./data/seedf-edital.json",
  "./data/leis-primeiro-flashcards.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
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
  void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined);
  return response;
}

function networkFirst(request, fallbackUrl) {
  return fetch(request, { cache: "no-store" })
    .then((response) => cacheResponse(request, response))
    .catch(() =>
      caches.match(request).then((cached) =>
        cached || (fallbackUrl ? caches.match(fallbackUrl) : undefined),
      ),
    );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || !isSameOrigin(request)) return;

  const url = new URL(request.url);
  const acceptsHtml = request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html");
  const isDataSnapshot = /\/data\/[^/]+\.json$/i.test(url.pathname);
  const isStableStudyAsset = /\/(?:leis-enhanced|reading-preferences)\.(?:css|js)$/i.test(url.pathname);
  const isStaticAsset = /\.(?:css|js|json|svg|webmanifest|woff2?)$/i.test(url.pathname);

  if (acceptsHtml) {
    event.respondWith(
      networkFirst(request, new URL("./", self.registration.scope).href),
    );
    return;
  }

  if (isDataSnapshot || isStableStudyAsset) {
    event.respondWith(networkFirst(request));
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
