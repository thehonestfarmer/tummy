"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/registerServiceWorker";

/** Renders nothing. Registers the worker, so a launch with no signal lands somewhere. */
export function ServiceWorker() {
  useEffect(() => {
    const t = setTimeout(() => {
      registerServiceWorker().catch(() => {});
    }, 0);
    return () => clearTimeout(t);
  }, []);

  return null;
}
