"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { formatDay } from "@/lib/health/zone";
import { useHealthDay } from "./HealthDay";
import { FoodSheet } from "./FoodSheet";
import { QuickLog } from "./QuickLog";

/**
 * Home's actions, docked at the bottom edge where a thumb reaches (§8): a
 * large Add food and the quick-log mic beside it. Start workout joins them
 * when training is built (§12, step 6).
 *
 * On a past day Add food logs into that day, and the mic steps aside: a
 * spoken log is about now.
 */
export function Dock() {
  const home = usePathname() === "/today";
  const { day, date } = useHealthDay();
  const [adding, setAdding] = useState(false);

  // Off Home there is nothing to dock, only the phone's own bottom edge to clear.
  if (!home) return <div style={{ height: "var(--safe-bottom)" }} />;

  return (
    <div
      className="border-t border-hairline bg-ground/95 px-4 pt-3 backdrop-blur-sm"
      style={{ paddingBottom: "max(var(--safe-bottom), 0.75rem)" }}
    >
      <div className="flex gap-2.5">
        <button
          onClick={() => setAdding(true)}
          className="flex h-16 min-w-0 flex-1 items-center justify-center gap-2.5 rounded-xl bg-ink text-[1.2rem] font-bold text-ground"
        >
          <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="truncate">{date === null ? "Add food" : `Add to ${formatDay(day.date)}`}</span>
        </button>
        {date === null ? <QuickLog /> : null}
      </div>
      {adding ? <FoodSheet onClose={() => setAdding(false)} /> : null}
    </div>
  );
}
