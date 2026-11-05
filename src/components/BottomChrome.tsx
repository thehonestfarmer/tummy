"use client";

import { useEffect, useRef } from "react";
import { TabBar } from "./TabBar";

/**
 * Owns everything pinned to the bottom edge, and publishes its measured height
 * so `main` can reserve exactly that much. Measured rather than assumed because
 * the dev strip wraps to two rows on a narrow phone, and isn't there at all in
 * production.
 */
export function BottomChrome({ children }: { children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const publish = () =>
      document.documentElement.style.setProperty("--bottom-chrome", `${el.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--bottom-chrome");
    };
  }, []);

  return (
    <div ref={ref} className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-2xl">
      {children}
      <TabBar />
    </div>
  );
}
