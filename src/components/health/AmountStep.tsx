"use client";

import { useState } from "react";
import type { FoodView } from "@/lib/health/foods";
import { NumberField, fmt } from "./fields";

const round = (g: number) => Math.round(g * 10) / 10;
const plural = (label: string, n: number) => (n === 1 || label.endsWith("s") ? label : `${label}s`);
const stepButton =
  "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-hairline-strong text-[1.5rem] leading-none text-ink disabled:text-ink-faint";

/**
 * How much (§5.6): counted in the food's own servings where it has them
 * ("2 packs", "3 pieces"), since that is how food is eaten, and in grams
 * when it doesn't or when you'd rather weigh it. Then one of two things:
 * log it as eaten, or put it in the fridge for later (§5.10).
 *
 * With "Both of us" on, the amount is the total, split between you, 50/50
 * unless you change it (§5.7). The kcal shown is a preview; the server does
 * the real sum.
 */
export function AmountStep({
  food,
  left,
  partnerName,
  onBack,
  onLog,
  onStock,
}: {
  food: FoodView;
  /** Grams of this in the fridge, or null when there is none. */
  left: number | null;
  partnerName: string;
  onBack: () => void;
  onLog: (food: FoodView, grams: number, partnerGrams?: number) => Promise<void>;
  onStock: (food: FoodView, grams: number) => Promise<void>;
}) {
  // The last unit is always plain grams.
  const GRAMS = food.servings.length;
  const startGrams = String(food.defaultGrams ?? 100);
  const [unit, setUnit] = useState(food.servings.length ? 0 : GRAMS);
  const [text, setText] = useState(food.servings.length ? "1" : startGrams);
  const [both, setBoth] = useState(false);
  const [mine, setMine] = useState<number | null>(null);
  const [busy, setBusy] = useState<"log" | "stock" | null>(null);

  const serving = unit === GRAMS ? null : food.servings[unit];
  const amount = text === "" ? null : Number(text);
  const grams = amount !== null && Number.isFinite(amount) && amount > 0 ? round(serving ? amount * serving.grams : amount) : null;
  const step = serving ? 1 : 10;

  const change = (next: string) => {
    setText(next);
    setMine(null);
  };
  const choose = (i: number) => {
    setUnit(i);
    change(i === GRAMS ? startGrams : "1");
  };
  const nudge = (by: number) => change(String(Math.max(step, round((amount ?? 0) + by))));

  const myShare = both ? (mine ?? (grams ? round(grams / 2) : null)) : grams;
  const theirShare = both && grams && myShare !== null ? round(Math.max(0, grams - myShare)) : null;
  const kcal = (g: number) => fmt((food.per100.kcal * g) / 100, 0);

  return (
    <div>
      <button onClick={onBack} className="h-9 text-[0.9rem] text-ink-dim">
        ← Back
      </button>
      <p className="pt-1 text-[1.15rem] leading-snug">{food.name}</p>
      <p className="text-[0.85rem] text-ink-dim">
        {fmt(food.per100.kcal, 0)} kcal per 100g
        {left ? ` · ${fmt(left, 0)}g in the fridge` : ""}
        {food.nameJa ? ` · ${food.nameJa}` : ""}
      </p>

      {food.servings.length ? (
        <div className="flex flex-wrap gap-1.5 pt-4">
          {[...food.servings.map((s) => `${plural(s.label, 2)} · ${fmt(s.grams)}g each`), "grams"].map((name, i) => (
            <button
              key={name}
              aria-pressed={unit === i}
              onClick={() => choose(i)}
              className="h-10 rounded-full border px-3.5 text-[0.9rem]"
              style={{
                borderColor: unit === i ? "var(--ink-dim)" : "var(--hairline)",
                color: unit === i ? "var(--ink)" : "var(--ink-dim)",
                background: unit === i ? "var(--ground-raised)" : "transparent",
              }}
            >
              {name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-3 pt-4">
        <button aria-label="Less" onClick={() => nudge(-step)} disabled={!amount || amount <= step} className={stepButton}>
          −
        </button>
        <label className="flex min-w-0 flex-1 items-baseline justify-center gap-2 rounded-[10px] border border-hairline bg-ground-sunk px-3 py-2">
          <input
            aria-label={serving ? `How many ${plural(serving.label, 2)}` : "Grams"}
            inputMode="decimal"
            value={text}
            onChange={(e) => change(e.target.value.replace(/[^\d.,]/g, "").replace(",", "."))}
            className="w-20 min-w-0 bg-transparent text-right text-[1.75rem] font-bold tabular-nums text-ink focus:outline-none"
          />
          <span className="text-[1rem] text-ink-dim">{serving ? plural(serving.label, amount ?? 0) : "g"}</span>
        </label>
        <button aria-label="More" onClick={() => nudge(step)} className={stepButton}>
          +
        </button>
      </div>
      <p className="h-6 pt-2 text-center text-[0.9rem] tabular-nums text-ink-dim">
        {grams
          ? `${serving ? `${fmt(grams)}g · ` : ""}${kcal(grams)} kcal · ${fmt((food.per100.protein_g * grams) / 100)}g protein`
          : ""}
      </p>

      <label className="flex items-center gap-2.5 pt-4 text-[0.95rem]">
        <input type="checkbox" checked={both} onChange={(e) => setBoth(e.target.checked)} className="h-4 w-4 accent-current" />
        Both of us
      </label>
      {both && grams ? (
        <div className="flex items-end gap-3 pt-3">
          <div key={`mine-${unit}-${grams}`} className="w-32">
            <NumberField label="You, in grams" value={myShare} onChange={setMine} />
          </div>
          <p className="pb-2 text-[0.9rem] tabular-nums text-ink-dim">
            {myShare !== null ? `${kcal(myShare)} kcal` : ""} · {partnerName} {theirShare !== null ? `${fmt(theirShare)}g` : ""}
          </p>
        </div>
      ) : null}

      <button
        onClick={async () => {
          if (!grams || myShare === null) return;
          setBusy("log");
          await onLog(food, myShare, both ? (theirShare ?? 0) : undefined);
          setBusy(null);
        }}
        disabled={busy !== null || !grams || myShare === null}
        className="mt-5 h-14 w-full rounded-xl bg-ink text-[1.1rem] font-bold text-ground disabled:opacity-50"
      >
        {busy === "log" ? "…" : both ? "Log for both of us" : "Log it"}
      </button>
      <button
        onClick={async () => {
          if (!grams) return;
          setBusy("stock");
          await onStock(food, grams);
          setBusy(null);
        }}
        disabled={busy !== null || !grams}
        className="mt-2 h-12 w-full rounded-xl border border-hairline-strong text-[1rem] text-ink disabled:text-ink-faint"
      >
        {busy === "stock" ? "…" : "Add to fridge"}
      </button>
    </div>
  );
}
