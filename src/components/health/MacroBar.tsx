"use client";

import type { Macros } from "@/lib/health/reading";
import { useHealthDay } from "./HealthDay";

const CELLS: { key: keyof Macros; label: string; unit: string }[] = [
  { key: "kcal", label: "kcal", unit: "" },
  { key: "protein_g", label: "protein", unit: "g" },
  { key: "fat_g", label: "fat", unit: "g" },
  { key: "carbs_g", label: "carbs", unit: "g" },
];

const whole = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * Consumed against target for the four numbers that matter, on every
 * Health screen (§8). Plain and quiet: going over is a number, not a colour.
 * `trailing` is where the quick-log mic sits.
 */
export function MacroBar({ trailing }: { trailing?: React.ReactNode }) {
  const { day } = useHealthDay();
  const { totals, target } = day.me;
  return (
    <div className="flex items-stretch gap-1 border-b border-hairline px-3 pt-1 pb-2.5">
      <div className="grid min-w-0 flex-1 grid-cols-[1.4fr_1fr_1fr_1fr] gap-1.5">
        {CELLS.map(({ key, label, unit }) => {
          const have = totals[key];
          const want = target?.[key] ?? null;
          const left = want === null ? null : want - have;
          return (
            <div key={key} className="min-w-0">
              <div className="truncate text-[0.7rem] leading-tight text-ink-faint">{label}</div>
              <div className="truncate pt-0.5 text-[1rem] leading-tight tabular-nums">
                {whole(have)}
                {want !== null ? <span className="text-ink-faint">/{whole(want)}</span> : null}
              </div>
              {left !== null ? (
                <div className="truncate pt-0.5 text-[0.75rem] leading-tight tabular-nums text-ink-dim">
                  {left >= 0 ? `${whole(left)}${unit} left` : `${whole(-left)}${unit} over`}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {trailing}
    </div>
  );
}

/** The partner's day, smaller, in their colour (§8). */
export function PartnerBar() {
  const { day } = useHealthDay();
  const p = day.partner;
  const color = p.slug === "bunny" ? "var(--bunny)" : "var(--bear)";
  return (
    <div className="flex items-baseline gap-3 text-[0.85rem] tabular-nums">
      <span style={{ color }}>{p.displayName}</span>
      {CELLS.map(({ key, label }) => (
        <span key={key} className="text-ink-dim">
          {whole(p.totals[key])}
          {p.target ? <span className="text-ink-faint">/{whole(p.target[key])}</span> : null}{" "}
          <span className="text-ink-faint">{key === "kcal" ? "kcal" : label[0].toUpperCase()}</span>
        </span>
      ))}
    </div>
  );
}
