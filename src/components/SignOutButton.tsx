"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        try {
          await fetch("/api/auth/logout", { method: "POST" });
          router.replace("/");
          router.refresh();
        } catch {
          setBusy(false);
        }
      }}
      disabled={busy}
      className="h-11 shrink-0 rounded-[10px] border border-hairline-strong px-4 text-[0.95rem] text-ink disabled:opacity-50"
    >
      {busy ? "…" : "Sign out"}
    </button>
  );
}
