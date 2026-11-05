"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TZ_COOKIE } from "@/lib/health/zone";

const YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Tells the server which time zone this phone is in, so "today" in Health is
 * the phone's own date. If the server rendered with a different zone, the
 * page re-renders once with the right one.
 */
export function ZoneCookie({ serverZone }: { serverZone: string }) {
  const router = useRouter();
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return;
    document.cookie = `${TZ_COOKIE}=${encodeURIComponent(tz)}; path=/; max-age=${YEAR_SECONDS}; samesite=lax`;
    if (tz !== serverZone) router.refresh();
  }, [router, serverZone]);
  return null;
}
