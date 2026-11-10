"use client";

import type { Macros } from "@/lib/health/reading";
import type { DaySide } from "@/lib/health/entries";
import { useHealthDay } from "./HealthDay";

const MACROS: { key: keyof Macros; label: string }[] = [
  { key: "protein_g", label: "Protein" },
  { key: "fat_g", label: "Fat" },
  { key: "carbs_g", label: "Carbs" },
];

const whole = (n: number) => Math.round(n).toLocaleString("en-US");

export const colorOf = (slug: DaySide["slug"]) => (slug === "bunny" ? "var(--bunny)" : "var(--bear)");

/** How far along, as a width. Over the target is a full bar; the number says by how much (§8). */
const filled = (have: number, want: number | null) =>
  want && want > 0 ? `${Math.min(100, Math.max(0, (have / want) * 100))}%` : "0%";

function Bar({ have, want, color, className }: { have: number; want: number | null; color: string; className: string }) {
  return (
    <div aria-hidden className={`overflow-hidden rounded-full bg-hairline ${className}`}>
      {/* The one piece of motion on the screen: a log landing is seen before it is read. */}
      <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: filled(have, want), background: color }} />
    </div>
  );
}

/** "52g left", or "8g over": the amount that matters, whichever side of the target it is on. */
function remaining(have: number, want: number | null): { amount: string; word: string } {
  if (want === null) return { amount: whole(have), word: "eaten" };
  const left = want - have;
  return left >= 0 ? { amount: whole(left), word: "left" } : { amount: whole(-left), word: "over" };
}

/**
 * The macro display on Home (§8): calories left as the one large number over
 * a bar, and three smaller bars for protein, fat and carbs, in the person's
 * own colour. Readable without reading digits. Going over is a full bar and
 * a number, not a warning colour.
 */
export function MacroDisplay() {
  const { day } = useHealthDay();
  const { totals, target, slug } = day.me;
  const color = colorOf(slug);
  const kcal = remaining(totals.kcal, target?.kcal ?? null);
  return (
    <section aria-label="Your macros" className="flex flex-col gap-3.5 border-b border-hairline px-5 pt-1.5 pb-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[3.25rem] leading-none font-bold tracking-tight tabular-nums">{kcal.amount}</span>
          <span className="text-[0.95rem] text-ink-dim">kcal {kcal.word}</span>
        </div>
        {target ? (
          <span className="text-[0.8rem] tabular-nums text-ink-dim">
            {whole(totals.kcal)} of {whole(target.kcal)}
          </span>
        ) : null}
      </div>
      <Bar have={totals.kcal} want={target?.kcal ?? null} color={color} className="h-2.5" />
      <div className="grid grid-cols-3 gap-4">
        {MACROS.map(({ key, label }) => {
          const r = remaining(totals[key], target?.[key] ?? null);
          return (
            <div key={key} className="flex min-w-0 flex-col gap-1.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[0.8rem] text-ink-dim">{label}</span>
                {target ? <span className="text-[0.75rem] tabular-nums text-ink-dim">/{whole(target[key])}</span> : null}
              </div>
              <span className="truncate text-[1.25rem] leading-none font-semibold tabular-nums">
                {r.amount}g <span className="text-[0.75rem] font-normal text-ink-dim">{r.word}</span>
              </span>
              <Bar have={totals[key]} want={target?.[key] ?? null} color={color} className="h-[5px]" />
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** The same numbers on one line, for every screen that isn't Home: there, but out of the way. */
export function MacroStrip() {
  const { day } = useHealthDay();
  const { totals, target, slug } = day.me;
  const kcal = remaining(totals.kcal, target?.kcal ?? null);
  return (
    <section aria-label="Your macros" className="flex flex-col gap-2 border-b border-hairline px-5 pt-1 pb-3">
      <div className="flex items-baseline justify-between gap-3 text-[0.85rem] text-ink-dim">
        <span>
          <span className="text-[1.05rem] font-bold tabular-nums text-ink">{kcal.amount}</span> kcal {kcal.word}
        </span>
        <span className="truncate tabular-nums">
          {MACROS.map(({ key, label }) => {
            const r = remaining(totals[key], target?.[key] ?? null);
            return `${label[0]} ${r.amount}g${r.word === "over" ? " over" : ""}`;
          }).join(" · ")}
        </span>
      </div>
      <Bar have={totals.kcal} want={target?.kcal ?? null} color={colorOf(slug)} className="h-[5px]" />
    </section>
  );
}

/** One side's day on one line, in their colour: the partner's on Home (§8). */
export function SideLine({ side }: { side: DaySide }) {
  const color = colorOf(side.slug);
  const kcal = remaining(side.totals.kcal, side.target?.kcal ?? null);
  return (
    <span className="flex w-full items-center gap-3 text-[0.9rem]">
      <span className="font-semibold" style={{ color }}>
        {side.displayName}
      </span>
      <Bar have={side.totals.kcal} want={side.target?.kcal ?? null} color={color} className="h-[5px] flex-1" />
      <span className="tabular-nums text-ink-dim">
        {kcal.amount} kcal {kcal.word}
      </span>
    </span>
  );
}
