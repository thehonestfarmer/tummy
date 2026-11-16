"use client";

import { usePathname } from "next/navigation";
import { MacroDisplay, MacroStrip } from "./MacroBar";
import { WeekStrip } from "./WeekStrip";

/**
 * What stays in view above every screen (§8): the week and the macro display in full on
 * Home, and as one line everywhere else except workout mode.
 */
export function HealthTop() {
  const path = usePathname();
  const home = path === "/today";
  // In the gym the food numbers are noise; the workout's own clock takes the top (§7.4).
  if (path === "/workout") return null;
  return (
    <div className="sticky top-0 z-30 bg-ground/95 backdrop-blur-sm">
      {home ? (
        <>
          <WeekStrip />
          <MacroDisplay />
        </>
      ) : (
        <MacroStrip />
      )}
    </div>
  );
}
