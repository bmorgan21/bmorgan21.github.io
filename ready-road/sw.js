const CACHE_NAME = "readyroad-v12";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      for (const file of APP_SHELL) {
        try {
          const response = await fetch(file, { cache: "reload" });
          if (response.ok) {
            await cache.put(file, response);
          }
        } catch (err) {
          console.warn("Unable to cache", file, err);
        }
      }

      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  if (
    url.hostname.includes("supabase.co") ||
    url.pathname.includes("/rest/v1/") ||
    url.pathname.includes("/auth/v1/")
  ) {
    return;
  }

  if (
    event.request.mode === "navigate" ||
    event.request.destination === "document"
  ) {
    event.respondWith(
      (async () => {
        try {
          const network = await fetch(event.request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, network.clone());
          return network;
        } catch {
          return (
            (await caches.match(event.request)) ||
            (await caches.match("./index.html"))
          );
        }
      })()
    );

    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;

      try {
        const network = await fetch(event.request);

        if (
          network.ok &&
          event.request.url.startsWith(self.location.origin)
        ) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, network.clone());
        }

        return network;
      } catch {
        return cached;
      }
    })()
  );
});