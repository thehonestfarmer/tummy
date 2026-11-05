/*
 * Build assets, and somewhere to land when there is no network.
 *
 * Caching is kept deliberately narrow (healthspec.md §3). A service worker
 * that caches an app shell is how an installed app ends up serving last
 * week's page forever, so nothing here stores a page or any API response:
 * those stay network-only and are allowed to fail when there is no signal.
 *
 * Failing is not the same as failing badly, though. The installed app opens
 * at /, so on a plane the very first thing it does is a navigation that
 * cannot succeed; left alone that is the browser's error page. So a failed
 * navigation is answered with /offline.html instead. It is a flat file rather
 * than a route on purpose; see the comment in it.
 */
const OFFLINE = "/offline.html"; // a flat file, so it needs none of the build
const ASSET_CACHE = "assets-v1";
const SHELL_CACHE = "offline-shell-v1";

/**
 * Precached rather than stored on first visit: nobody ever visits it on
 * purpose, so waiting for that would mean never having it when it is needed.
 * Tolerant of failure: losing the fallback is much better than failing the
 * install, which would leave the device with no worker at all.
 */
async function storeOfflinePage() {
  try {
    await (await caches.open(SHELL_CACHE)).add(OFFLINE);
  } catch {
    /* Retried on the next activate; offlinePage() has a built-in last resort. */
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await storeOfflinePage();
      // Take over from the previous worker now rather than on the next cold
      // start, so a deploy that changes any of this actually lands.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([ASSET_CACHE, SHELL_CACHE]);
      for (const name of await caches.keys()) if (!keep.has(name)) await caches.delete(name);
      if (!(await caches.match(OFFLINE, { cacheName: SHELL_CACHE }))) await storeOfflinePage();
      await self.clients.claim();
    })(),
  );
});

/** The landing place for any navigation that needed a network and didn't get one. */
async function offlinePage() {
  const cached = await caches.match(OFFLINE, { cacheName: SHELL_CACHE });
  if (cached) return cached;
  // Only reachable if the precache never succeeded. Still better than the
  // browser's error page, because it says the one thing worth saying.
  return new Response(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>No signal</title>` +
      `<body style="margin:0;display:grid;place-items:center;min-height:100dvh;` +
      `background:#17191c;color:#e4e6e9;font:400 1rem system-ui,sans-serif;text-align:center">` +
      `<p>No signal.</p>`,
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

/** Build assets are content-hashed, so a cache hit is always correct. */
async function assetCacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const fresh = await fetch(request);
  if (fresh.ok) await cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Network-only by design; it just needs a landing place when the network isn't there.
    event.respondWith(fetch(request).catch(() => offlinePage()));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(assetCacheFirst(request));
  }
});
