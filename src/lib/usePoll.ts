"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const POLL_NOW = "tb:poll-now";

/**
 * There are no push notifications by design — state resolves when the app is
 * opened. So: poll on mount, on visibilitychange, and on an interval while the
 * tab is actually visible.
 */
export function usePoll<T>(url: string, intervalMs: number, initial: T) {
  const [data, setData] = useState<T>(initial);
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (inflight.current || document.visibilityState === "hidden") return;
    inflight.current = true;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) setData((await res.json()) as T);
    } catch {
      // Offline or asleep; the next tick will catch up.
    } finally {
      inflight.current = false;
    }
  }, [url]);

  useEffect(() => {
    // Once on mount too: the server render can already be stale by hydration.
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    // Lets anything on the page ask for an immediate re-read.
    window.addEventListener(POLL_NOW, refresh);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(POLL_NOW, refresh);
    };
  }, [refresh, intervalMs]);

  return { data, setData, refresh };
}
