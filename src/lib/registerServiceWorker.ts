/**
 * The worker only caches build assets and an offline page (healthspec.md §3).
 * Registering twice with the same script and scope is a no-op, so this is
 * safe to call on every page.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register(new URL("./service-worker.js", import.meta.url), {
    scope: "/",
    updateViaCache: "none",
  });
}
