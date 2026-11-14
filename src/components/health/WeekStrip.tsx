"use client";

import { useEffect, useState } from "react";
import type { WeekView } from "@/lib/health/week";
import { useHealthDay } from "./HealthDay";
import { colorOf } from "./MacroBar";

const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const whole = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * The week on Home (§8): Monday to Sunday, each day a small bar of calories
 * against that day's target, with a dot when your partner logged. Tap a day
 * to see it. Underneath, how far under target the week's finished days add
 * up to, which is the number a single day can't show.
 *
 * It re-reads whenever the day on show changes or its total moves, so a log
 * lands here as well as in the display below.
 */
export function WeekStrip() {
  const { day, setDate } = useHealthDay();
  const [week, setWeek] = useState<WeekView | null>(null);
  const mine = colorOf(day.me.slug);
  const theirs = colorOf(day.partner.slug);

  useEffect(() => {
    let live = true;
    fetch(`/api/week?date=${day.date}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json: WeekView) => live && setWeek(json))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [day.date, day.me.totals.kcal, day.partner.totals.kcal]);

  // Until the week arrives the strip keeps its height, so nothing below it jumps.
  const days = week?.days.some((d) => d.date === day.date) ? week.days : null;

  return (
    <section aria-label="This week" className="px-3 pt-1 pb-2">
      <div className="grid grid-cols-7">
        {LETTERS.map((letter, i) => {
          const d = days?.[i];
          const shown = d?.date === day.date;
          const ahead = !d || !week || d.date > week.today;
          const share = d && d.target ? Math.min(1, d.kcal / d.target) : 0;
          const over = d !== undefined && d.target !== null && d.kcal > d.target;
          return (
            <button
              key={i}
              disabled={ahead}
              aria-label={d ? `${d.date}: ${whole(d.kcal)} kcal${d.target ? ` of ${whole(d.target)}` : ""}` : undefined}
              aria-current={shown ? "date" : undefined}
              onClick={() => d && setDate(d.date)}
              className="flex h-[4.25rem] flex-col items-center justify-between rounded-[10px] py-1.5"
              style={{ background: shown ? "var(--ground-raised)" : "transparent" }}
            >
              <span
                className="text-[0.7rem] leading-none"
                style={{ color: d && week && d.date === week.today ? "var(--ink)" : "var(--ink-dim)", fontWeight: shown ? 700 : 400 }}
              >
                {letter}
              </span>
              <span aria-hidden className="relative flex h-7 w-2 items-end overflow-hidden rounded-full bg-hairline" style={{ opacity: ahead ? 0.45 : 1 }}>
                <span className="w-full rounded-full transition-[height] duration-500 ease-out" style={{ height: `${share * 100}%`, background: mine }} />
                {/* Over target is a full bar with a pale cap: seen, not scolded. */}
                {over ? <span className="absolute inset-x-0 top-0 h-1 rounded-full bg-ink" /> : null}
              </span>
              <span aria-hidden className="h-1 w-1 rounded-full" style={{ background: d?.partnerLogged ? theirs : "transparent" }} />
            </button>
          );
        })}
      </div>
      <p className="h-5 px-2 pt-1 text-[0.8rem] tabular-nums text-ink-dim">
        {week && days
          ? week.counted
            ? `${whole(Math.abs(week.deficit))} kcal ${week.deficit >= 0 ? "under" : "over"} target this week · ${week.counted} ${week.counted === 1 ? "day" : "days"}`
            : "The week's total starts once a day is finished."
          : ""}
      </p>
    </section>
  );
}
