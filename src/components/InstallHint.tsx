"use client";

import { useState, useSyncExternalStore } from "react";
import { APP_NAME } from "@/lib/config";

const KEY = "tb.install-hint.dismissed";
const subscribe = () => () => {};

/**
 * iOS has no install prompt to call: `beforeinstallprompt` is a Chromium-only,
 * non-standard API that WebKit has never shipped. Add to Home Screen is always
 * a manual trip through the Share sheet, so the most a page can do is point at
 * it clearly.
 *
 * It is not Safari-only. Since iOS 16.4 the Share sheet can install from
 * Firefox, Chrome, Edge and Orion too — every iOS browser runs on WebKit, so
 * the instruction reads the same in all of them. Older iOS really was Safari
 * only, hence the version check.
 */
const INSTALLABLE_SINCE = [16, 4];

function iosVersion(ua: string): [number, number] | null {
  const m = ua.match(/OS (\d+)[._](\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

function eligible(): boolean {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true;
  if (standalone) return false;

  const ua = window.navigator.userAgent;
  if (!/iPhone|iPad|iPod/.test(ua)) return false;

  const version = iosVersion(ua);
  const isSafari = !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|Brave|DuckDuckGo|YaBrowser/.test(ua);
  const [major, minor] = INSTALLABLE_SINCE;
  const modernEnough =
    !version || version[0] > major || (version[0] === major && version[1] >= minor);
  if (!isSafari && !modernEnough) return false;

  try {
    return !localStorage.getItem(KEY);
  } catch {
    // Private mode; skip the hint rather than break the page.
    return false;
  }
}

/** The iOS share glyph: a box open at the top with an arrow leaving it. */
function ShareGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      // Preflight makes svg display:block, which would drop it onto its own line.
      className="inline-block h-[15px] w-[15px] align-[-3px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8.5 10.5H6.5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-2" />
      <path d="M12 14.5V3.5" />
      <path d="M8.75 6.75 12 3.5l3.25 3.25" />
    </svg>
  );
}

export function InstallHint() {
  const show = useSyncExternalStore(subscribe, eligible, () => false);
  const [dismissed, setDismissed] = useState(false);

  if (!show || dismissed) return null;

  return (
    <div className="border-b border-hairline bg-ground-raised px-4 py-2.5 text-[0.85rem] text-ink-dim">
      <div className="flex items-start gap-3">
        <p className="flex-1 leading-snug">
          Tap <ShareGlyph /> then <span className="text-ink">Add to Home Screen</span> to keep{" "}
          {APP_NAME} one tap away.
        </p>
        <button
          onClick={() => {
            try {
              localStorage.setItem(KEY, "1");
            } catch {
              // Nothing to persist to; the hint just comes back next launch.
            }
            setDismissed(true);
          }}
          className="shrink-0 text-ink-faint"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
