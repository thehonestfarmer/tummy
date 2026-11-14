"use client";

import { usePathname } from "next/navigation";
import { MacroDisplay, MacroStrip } from "./MacroBar";
import { WeekStrip } from "./WeekStrip";

/**
 * What stays in view above every screen (§8): the week and the macro display in full on
 * Home, and as one line everywhere else.
 */
export function HealthTop() {
  const home = usePathname() === "/today";
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
