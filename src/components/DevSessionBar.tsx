"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { POLL_NOW } from "@/lib/usePoll";
import { DEV_BAR_TOGGLE, devBarHidden, toggleDevBar } from "@/lib/devBar";

const CHROME = { border: "#4a3f31", ink: "#d8bd98" };

/** Deliberately off-palette: this strip is scaffolding, not part of the app. */
export function DevSessionBar({
  displayName,
  partnerName,
}: {
  displayName: string;
  partnerName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Shown until hydration reads the saved choice, so server and client agree.
  const [hidden, setHidden] = useState(false);

  // Settings has the switch that puts this away; see DevBarToggle.
  useEffect(() => {
    const t = setTimeout(() => setHidden(devBarHidden()), 0);
    const onToggle = (e: Event) => setHidden((e as CustomEvent<boolean>).detail);
    window.addEventListener(DEV_BAR_TOGGLE, onToggle);
    return () => {
      clearTimeout(t);
      window.removeEventListener(DEV_BAR_TOGGLE, onToggle);
    };
  }, []);

  async function become() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/dev/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "switch" }),
      });
      if (!res.ok) return;
      // Re-read the day now, as the other person, rather than at the next tick.
      window.dispatchEvent(new Event(POLL_NOW));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (hidden) return null;

  return (
    <div
      className="px-4 py-2 text-[0.8rem]"
      style={{ background: "#241f1a", borderTop: "1px solid #3a3128", color: "#b39a7c" }}
    >
      <div className="flex items-center gap-2">
        <span className="mr-auto truncate">dev &middot; {displayName}</span>
        <button
          onClick={become}
          disabled={busy}
          className="shrink-0 rounded-[10px] border px-2.5 py-1 disabled:opacity-50"
          style={{ borderColor: CHROME.border, color: CHROME.ink }}
        >
          {busy ? "…" : `Become ${partnerName}`}
        </button>
      </div>
    </div>
  );
}

/** On Settings, where the strip exists: puts it away when it isn't needed, and brings it back. */
export function DevBarToggle() {
  return (
    <button onClick={toggleDevBar} className="mt-8 text-[0.9rem] underline underline-offset-4" style={{ color: CHROME.ink }}>
      Show or hide the dev strip
    </button>
  );
}
