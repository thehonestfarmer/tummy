"use client";

import { useState } from "react";
import type { Macros } from "@/lib/health/reading";
import { mealsAt } from "@/lib/health/fit";
import { fmt } from "./fields";

const STORE = "tummy-meals";

/**
 * How many meals the day still has (§5.13). Guessed from the clock, and
 * changed with a tap; the tap is kept for the tab until the guess itself
 * moves on, so lunch's answer isn't still standing at dinner.
 */
export function useMeals(date: string): [number, (n: number) => void] {
  const [state, setState] = useState(() => {
    const guess = mealsAt(new Date().getHours());
    try {
      const kept = JSON.parse(sessionStorage.getItem(STORE) ?? "null") as { date: string; guess: number; n: number } | null;
      if (kept && kept.date === date && kept.guess === guess) return { guess, n: kept.n };
    } catch {
      // Nothing kept, or no storage: the guess stands.
    }
    return { guess, n: guess };
  });
  const set = (n: number) => {
    setState((s) => ({ ...s, n }));
    try {
      sessionStorage.setItem(STORE, JSON.stringify({ date, guess: state.guess, n }));
    } catch {
      // Private mode: it lasts as long as this screen.
    }
  };
  return [state.n, set];
}

export function MealsChips({ meals, onMeals, label = "Meals still to come today" }: { meals: number; onMeals: (n: number) => void; label?: string }) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={label}>
      <span className="min-w-0 flex-1 text-[0.85rem] text-ink-dim">{label}</span>
      {[1, 2, 3].map((n) => (
        <button
          key={n}
          aria-pressed={meals === n}
          onClick={() => onMeals(n)}
          className="h-10 w-10 shrink-0 rounded-full border text-[0.95rem] tabular-nums"
          style={{
            borderColor: meals === n ? "var(--ink)" : "var(--hairline-strong)",
            background: meals === n ? "var(--ink)" : "transparent",
            color: meals === n ? "var(--ground)" : "var(--ink-dim)",
            fontWeight: meals === n ? 700 : 400,
          }}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

/** "870 kcal · P 42": a room, or anything else measured in macros, in a few characters. */
export const macroText = (m: Macros) => `${Math.round(m.kcal).toLocaleString("en-US")} kcal · P ${fmt(m.protein_g, 0)}`;

export function RoomLine({ name, color, room }: { name: string; color: string; room: Macros }) {
  return (
    <p className="flex items-center gap-2 text-[0.9rem]">
      <span aria-hidden className="h-4 w-1 shrink-0 rounded-full" style={{ background: color }} />
      <span className="min-w-0 flex-1 truncate">{name} has room for</span>
      <span className="shrink-0 font-semibold tabular-nums">{macroText(room)}</span>
    </p>
  );
}
