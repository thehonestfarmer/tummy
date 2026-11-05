"use client";

import { MacroBar } from "./MacroBar";
import { QuickLog } from "./QuickLog";

/**
 * What sits above every Health screen. The quick-log mic joins the bar here
 * (§5.5), so it is one reach away wherever you are in Health.
 */
export function HealthTop() {
  return (
    <div className="sticky top-0 z-30 bg-ground/95 backdrop-blur-sm" style={{ top: 0 }}>
      <MacroBar trailing={<QuickLog />} />
    </div>
  );
}
