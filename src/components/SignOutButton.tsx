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
      className="-mr-1 px-1 text-[0.8rem] leading-none text-ink-faint disabled:opacity-50"
    >
      {busy ? "…" : "Sign out"}
    </button>
  );
}
