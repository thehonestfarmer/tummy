"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/registerServiceWorker";

/** Renders nothing. Registers the worker, so a launch with no signal lands somewhere. */
export function ServiceWorker() {
  useEffect(() => {
    const t = setTimeout(() => {
      // The worker serves build assets cache-first because their names are
      // content hashes. In development the names stay put while the code
      // changes, so a worker there pins the browser to old code: take it out.
      if (process.env.NODE_ENV === "development") {
        void navigator.serviceWorker?.getRegistrations().then((all) => all.forEach((r) => r.unregister()));
        void window.caches?.keys().then((names) => names.forEach((n) => caches.delete(n)));
        return;
      }
      registerServiceWorker().catch(() => {});
    }, 0);
    return () => clearTimeout(t);
  }, []);

  return null;
}
